// app/api/alt/upload/route.ts
// Auto-detection: AI identifies fund name, asset class, doc type from document content

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, updateDocError, saveFacts, saveManager } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const VALID_ASSET_CLASSES = [
  'Private Equity',
  'Private Credit',
  'Hedge Funds',
  'Managed Futures',
  'Private Real Estate',
  'Energy',
  'Crypto Assets',
  'Opportunistic',
  'Research',
]

const VALID_DOC_TYPES = [
  'PPM',
  'DDQ',
  'Audited Financials',
  'Quarterly Letter',
  'Tear Sheet',
  'Other',
]

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 1. Extract text from document
    let extractedText = ''
    let pageCount = 0

    try {
      const { text, metadata } = await extractDocumentText(
        await file.arrayBuffer(),
        file.name
      )
      extractedText = cleanTextForExtraction(text)
      pageCount = (metadata.pages as number) || 0
    } catch (err) {
      return NextResponse.json(
        { error: `Text extraction failed: ${(err as Error).message}` },
        { status: 500 }
      )
    }

    const truncatedText = extractedText.substring(0, 100000)

    // 2. AI auto-detection: identify everything from the document
    const autoDetectPrompt = `You are analyzing an alternative investment fund document. Extract ALL available information and return ONLY valid JSON.

VALID ASSET CLASSES (pick the closest match):
${VALID_ASSET_CLASSES.join(' | ')}

VALID DOC TYPES (pick the closest match):
${VALID_DOC_TYPES.join(' | ')}

Return this exact JSON structure (use null for anything not found):
{
  "fund_name": "exact fund name from document",
  "manager_name": "GP or management company name",
  "asset_class": "one of the valid asset classes above",
  "doc_type": "one of the valid doc types above",
  "vintage_year": number or null,
  "fund_size_mm": number in millions or null,
  "target_irr": decimal (e.g. 0.18 for 18%) or null,
  "irr_net": decimal or null,
  "irr_gross": decimal or null,
  "tvpi": decimal or null,
  "dpi": decimal or null,
  "moic": decimal or null,
  "management_fee_pct": decimal (e.g. 0.02 for 2%) or null,
  "carry_pct": decimal (e.g. 0.20 for 20%) or null,
  "gp_commitment_pct": decimal or null,
  "lock_up_months": number or null,
  "hurdle_rate": decimal or null,
  "fund_size_mm": number or null,
  "committed_capital_mm": number or null,
  "called_capital_mm": number or null,
  "investment_strategy": "brief description of strategy",
  "target_geographies": ["list of geographies"],
  "target_sectors": ["list of sectors or asset types"],
  "key_personnel": ["list of key people and roles"],
  "gp_team_size": number or null,
  "style_drift_flags": ["any concerns about strategy drift"],
  "concentration_risks": ["any concentration concerns"],
  "deployment_pace_concern": "any concerns about deployment pace or null",
  "confidence_score": 0.0-1.0 based on how much data was found
}

Document content:
---
${truncatedText}
---

Return ONLY valid JSON. No preamble, no explanation.`

    let extractedFacts: Record<string, any> = {}

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: autoDetectPrompt }],
      })

      const responseText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('')

      try {
        extractedFacts = JSON.parse(responseText)
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) extractedFacts = JSON.parse(match[0])
        else throw new Error('Could not parse AI response as JSON')
      }
    } catch (err) {
      return NextResponse.json(
        { error: `AI extraction failed: ${(err as Error).message}` },
        { status: 500 }
      )
    }

    // 3. Validate and normalize asset class
    const assetClass = VALID_ASSET_CLASSES.includes(extractedFacts.asset_class)
      ? extractedFacts.asset_class
      : 'Opportunistic'

    // 4. Validate and normalize doc type
    const docType = VALID_DOC_TYPES.includes(extractedFacts.doc_type)
      ? extractedFacts.doc_type
      : 'Other'

    // ── Strict matching helpers ───────────────────────────────────────────────

    // Normalize a name for comparison: lowercase, remove punctuation/common suffixes
    function normalizeName(name: string): string {
      return name
        .toLowerCase()
        .replace(/\b(the|of|and|llc|lp|inc|ltd|fund|capital|partners|advisors|management|group|private|equity|credit|investments?)\b/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Calculate what % of words in A appear in B
    function wordOverlap(a: string, b: string): number {
      const wordsA = a.split(' ').filter(w => w.length > 1)
      const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
      if (!wordsA.length) return 0
      const matches = wordsA.filter(w => wordsB.has(w)).length
      return matches / wordsA.length
    }

    // Two names are a match only if BOTH directions have high overlap
    function isStrongMatch(name1: string, name2: string): boolean {
      if (!name1 || !name2) return false
      const n1 = normalizeName(name1)
      const n2 = normalizeName(name2)
      if (!n1 || !n2) return false

      // Exact match after normalization
      if (n1 === n2) return true

      // Both directions must have >= 70% word overlap
      const overlap1 = wordOverlap(n1, n2)
      const overlap2 = wordOverlap(n2, n1)
      return overlap1 >= 0.7 && overlap2 >= 0.7
    }

    // 5. Check if fund already exists using strict matching
    let managerId: string
    let isExisting = false

    const { data: existingManagers } = await supabase
      .from('alt_managers')
      .select('id, fund_name, manager_name, asset_class')

    if (existingManagers?.length && extractedFacts.fund_name) {
      for (const existing of existingManagers) {
        // Fund name must strongly match
        const fundMatch = isStrongMatch(extractedFacts.fund_name, existing.fund_name)

        // Manager name match requires same asset class AND strong name match
        const managerMatch = extractedFacts.manager_name &&
          existing.manager_name &&
          existing.asset_class === assetClass &&
          isStrongMatch(extractedFacts.manager_name, existing.manager_name)

        if (fundMatch || managerMatch) {
          managerId = existing.id
          isExisting = true
          break
        }
      }
    }

    if (!isExisting) {
      const fundSlug = (extractedFacts.fund_name || `unknown-${Date.now()}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      managerId = crypto.randomUUID()

      const { error: managerError } = await saveManager({
        id: managerId,
        fund_name: extractedFacts.fund_name || file.name.replace(/\.[^/.]+$/, ''),
        manager_name: extractedFacts.manager_name || null,
        asset_class: assetClass,
        fund_slug: fundSlug,
        vintage_year: extractedFacts.vintage_year || null,
        fund_size_mm: extractedFacts.fund_size_mm || null,
        target_irr: extractedFacts.target_irr || null,
        management_fee_pct: extractedFacts.management_fee_pct || null,
        carry_pct: extractedFacts.carry_pct || null,
        gp_commitment_pct: extractedFacts.gp_commitment_pct || null,
        lock_up_months: extractedFacts.lock_up_months || null,
        strategy_description: extractedFacts.investment_strategy || null,
        geography: extractedFacts.target_geographies || [],
        sector_focus: extractedFacts.target_sectors || [],
        team_size: extractedFacts.gp_team_size || null,
      })

      if (managerError) {
        return NextResponse.json(
          { error: `Failed to create manager: ${managerError.message}` },
          { status: 500 }
        )
      }
    }

    // 6. Upload file to Supabase Storage
    const fileName = `${managerId}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('alt_documents')
      .upload(fileName, file, { upsert: false })

    if (uploadError) {
      console.error('Storage error:', uploadError)
    }

    // 7. Create document record
    const { data: docRecord, error: docError } = await saveDoc({
      manager_id: managerId,
      doc_type: docType,
      doc_name: file.name,
      file_path: fileName,
      file_size_kb: Math.round(file.size / 1024),
      status: 'extracted',
    })

    if (docError) {
      return NextResponse.json(
        { error: `Failed to create doc record: ${docError.message}` },
        { status: 500 }
      )
    }

    const docId = docRecord?.id

    // 8. Update doc with extracted text
    if (docId) {
      await updateDocStatus(docId, 'extracted', truncatedText, pageCount)
    }

    // 9. Save extracted facts
    const { data: factsData, error: factsError } = await saveFacts({
      manager_id: managerId,
      doc_id: docId,
      irr_net: extractedFacts.irr_net || null,
      irr_gross: extractedFacts.irr_gross || null,
      tvpi: extractedFacts.tvpi || null,
      dpi: extractedFacts.dpi || null,
      moic: extractedFacts.moic || null,
      management_fee_pct: extractedFacts.management_fee_pct || null,
      carry_pct: extractedFacts.carry_pct || null,
      hurdle_rate: extractedFacts.hurdle_rate || null,
      lock_up_months: extractedFacts.lock_up_months || null,
      gp_commitment_pct: extractedFacts.gp_commitment_pct || null,
      preferred_return_pct: null,
      clawback_provision: null,
      secondary_sale_rights: null,
      fund_size_mm: extractedFacts.fund_size_mm || null,
      committed_capital_mm: extractedFacts.committed_capital_mm || null,
      called_capital_mm: extractedFacts.called_capital_mm || null,
      unfunded_capital_mm: null,
      team_founding_year: null,
      gp_team_size: extractedFacts.gp_team_size || null,
      key_personnel: extractedFacts.key_personnel || [],
      investment_strategy: extractedFacts.investment_strategy || null,
      target_geographies: extractedFacts.target_geographies || [],
      target_sectors: extractedFacts.target_sectors || [],
      avg_ticket_size_mm: null,
      portfolio_concentration_pct: null,
      style_drift_flags: extractedFacts.style_drift_flags || [],
      deployment_pace_concern: extractedFacts.deployment_pace_concern || null,
      concentration_risks: extractedFacts.concentration_risks || [],
      operational_dd_notes: null,
      confidence_score: extractedFacts.confidence_score || 0.8,
      extraction_source: docId,
      fact_type: 'from_document',
      raw_extraction: extractedFacts,
    })

    if (factsError) {
      console.error('Facts save error:', factsError)
    }

    return NextResponse.json({
      success: true,
      managerId,
      docId,
      isExisting,
      extractedFacts: {
        ...extractedFacts,
        asset_class: assetClass,
        doc_type: docType,
      },
      message: 'Document uploaded and extracted successfully',
    })

  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message}` },
      { status: 500 }
    )
  }
}

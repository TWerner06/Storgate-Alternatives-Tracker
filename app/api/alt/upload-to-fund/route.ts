// app/api/alt/upload-to-fund/route.ts
// Upload a document directly to a specific fund — no fuzzy matching needed

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, saveFacts } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const VALID_DOC_TYPES = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const managerId = formData.get('managerId') as string

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!managerId) return NextResponse.json({ error: 'No managerId provided' }, { status: 400 })

    // Verify manager exists
    const { data: manager, error: managerError } = await supabase
      .from('alt_managers')
      .select('id, fund_name, asset_class')
      .eq('id', managerId)
      .single()

    if (managerError || !manager) {
      return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
    }

    // 1. Extract text
    let extractedText = ''
    let pageCount = 0

    try {
      const { text, metadata } = await extractDocumentText(await file.arrayBuffer(), file.name)
      extractedText = cleanTextForExtraction(text)
      pageCount = (metadata.pages as number) || 0
    } catch (err) {
      return NextResponse.json({ error: `Text extraction failed: ${(err as Error).message}` }, { status: 500 })
    }

    const truncatedText = extractedText.substring(0, 100000)

    // 2. AI extraction — just facts, no fund identification needed
    const prompt = `You are analyzing an alternative investment fund document for ${manager.fund_name} (${manager.asset_class}).
Extract all available data and return ONLY valid JSON:

{
  "doc_type": "PPM | DDQ | Audited Financials | Quarterly Letter | Tear Sheet | Other",
  "irr_net": decimal or null,
  "irr_gross": decimal or null,
  "tvpi": decimal or null,
  "dpi": decimal or null,
  "moic": decimal or null,
  "management_fee_pct": decimal (e.g. 0.02) or null,
  "carry_pct": decimal (e.g. 0.20) or null,
  "gp_commitment_pct": decimal or null,
  "hurdle_rate": decimal or null,
  "lock_up_months": number or null,
  "fund_size_mm": number in millions or null,
  "committed_capital_mm": number or null,
  "called_capital_mm": number or null,
  "target_irr": decimal or null,
  "vintage_year": number or null,
  "investment_strategy": "brief description" or null,
  "target_geographies": ["list"] or [],
  "target_sectors": ["list"] or [],
  "key_personnel": ["list"] or [],
  "gp_team_size": number or null,
  "style_drift_flags": ["list"] or [],
  "concentration_risks": ["list"] or [],
  "deployment_pace_concern": "string" or null,
  "confidence_score": 0.0-1.0
}

Document:
---
${truncatedText}
---

Return ONLY valid JSON.`

    let extractedFacts: Record<string, any> = {}

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
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
      }
    } catch (err) {
      console.error('AI extraction error:', err)
      // Non-fatal — continue with empty facts
    }

    const docType = VALID_DOC_TYPES.includes(extractedFacts.doc_type) ? extractedFacts.doc_type : 'Other'

    // 3. Upload to storage
    const fileName = `${managerId}/${Date.now()}-${file.name}`
    await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })

    // 4. Create doc record
    const { data: docRecord, error: docError } = await saveDoc({
      manager_id: managerId,
      doc_type: docType,
      doc_name: file.name,
      file_path: fileName,
      file_size_kb: Math.round(file.size / 1024),
      status: 'extracted',
    })

    if (docError) {
      return NextResponse.json({ error: `Failed to create doc record: ${docError.message}` }, { status: 500 })
    }

    const docId = docRecord?.id

    // 5. Update doc with extracted text
    if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

    // 6. Save facts
    if (Object.keys(extractedFacts).length > 0) {
      await saveFacts({
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
    }

    return NextResponse.json({ success: true, docId, managerId, docType })

  } catch (err) {
    console.error('Upload-to-fund error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

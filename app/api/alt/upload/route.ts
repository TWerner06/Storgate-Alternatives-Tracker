// app/api/alt/upload/route.ts
// Auto-detection: AI identifies fund name, asset class, doc type from document content.
// Includes:
//   - Layer 1: Document classification gate (single-fund vs multi-fund/market report)
//   - Layer 2: Fund-name attribution check on source quotes
//   - Field-level confidence scoring + improved quote verification (multi-window)
//   - target_fund_size_mm / deployed_capital_mm / IRR target vs realized distinction

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, updateDocError, saveFacts, saveManager } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'
import { validateExtraction, formatIssuesForStorage, verifySourceQuote } from '@/lib/extraction-validator'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const VALID_ASSET_CLASSES = [
  'Private Equity', 'Private Credit', 'Hedge Funds', 'Managed Futures',
  'Private Real Estate', 'Energy', 'Crypto Assets', 'Opportunistic', 'Research',
]

const VALID_DOC_TYPES = [
  'PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other',
]

const QUOTE_REQUIRED_FIELDS = [
  'fund_size_mm', 'target_fund_size_mm', 'deployed_capital_mm',
  'target_irr', 'irr_net', 'irr_gross', 'tvpi', 'dpi', 'moic',
  'management_fee_pct', 'carry_pct', 'gp_commitment_pct', 'hurdle_rate', 'lock_up_months',
]

type ClassificationResult = {
  is_single_fund: boolean
  document_scope: 'single_fund' | 'multi_fund' | 'market_report' | 'other'
  fund_name_detected: string | null
  reasoning: string
}

async function classifyDocument(text: string): Promise<ClassificationResult> {
  const classifyPrompt = `You are classifying an alternative investment document. Determine if this is a SINGLE fund document or a MULTI-FUND/MARKET document.

SINGLE FUND: PPM, DDQ, quarterly letter, audited financials, tear sheet, pitch deck — all for one specific fund.
MULTI-FUND / MARKET: industry surveys, database reports, universe benchmarks, newsletters covering many managers, any document with performance tables showing 10+ fund names.

Return ONLY valid JSON:
{
  "is_single_fund": true or false,
  "document_scope": "single_fund" | "multi_fund" | "market_report" | "other",
  "fund_name_detected": "exact fund name if single fund, otherwise null",
  "reasoning": "one sentence explaining your classification"
}

Document (first 8000 characters):
---
${text.substring(0, 8000)}
---

Return ONLY valid JSON.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: classifyPrompt }],
  })

  const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')

  try { return JSON.parse(responseText) } catch {
    const match = responseText.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    return { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification failed' }
  }
}

function checkAttribution(fundName: string | null, sourceQuote: string | null, fieldValue: any): boolean {
  if (!fundName || !sourceQuote || fieldValue == null) return true
  const normalizedQuote = sourceQuote.toLowerCase()
  const stopWords = new Set(['the', 'of', 'and', 'llc', 'lp', 'inc', 'ltd', 'fund', 'capital', 'partners', 'advisors', 'management', 'group', 'private'])
  const fundKeywords = fundName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
  const aggregateRedFlags = ['total aum', 'total assets under management', 'platform aum', 'firm aum', 'firm-wide', 'firmwide', 'across all funds', 'across our funds', 'aggregate', 'combined', 'total across', 'universe', 'industry', 'average of', 'median of', 'all funds', 'peer group', 'total fund size across', 'funds under management']
  for (const flag of aggregateRedFlags) { if (normalizedQuote.includes(flag)) return false }
  if (fundKeywords.length > 0) {
    const hasKeyword = fundKeywords.some(kw => normalizedQuote.includes(kw))
    const genericFundRefs = ['the fund', 'this fund', 'the partnership', 'the vehicle']
    const hasGenericRef = genericFundRefs.some(ref => normalizedQuote.includes(ref))
    if (!hasKeyword && !hasGenericRef && normalizedQuote.length > 50) return false
  }
  return true
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const MAX_FILE_SIZE_MB = 20
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json({ error: `File is ${fileSizeMB.toFixed(1)}MB, which exceeds the ${MAX_FILE_SIZE_MB}MB limit. Try compressing the PDF.` }, { status: 413 })
    }

    let extractedText = ''
    let pageCount = 0
    try {
      const { text, metadata } = await extractDocumentText(await file.arrayBuffer(), file.name)
      extractedText = cleanTextForExtraction(text)
      pageCount = (metadata.pages as number) || 0
    } catch (err) {
      return NextResponse.json({ error: `Text extraction failed: ${(err as Error).message}` }, { status: 500 })
    }

    if (extractedText.trim().length < 200 && pageCount > 0) {
      return NextResponse.json({ error: `This document appears to contain mostly images or scanned pages (only ${extractedText.trim().length} characters found across ${pageCount} pages). Try a text-based document or run OCR first.` }, { status: 422 })
    }

    const MAX_CHARS = 180000
    const truncatedText = extractedText.substring(0, MAX_CHARS)
    const wasTruncated = extractedText.length > MAX_CHARS

    let classification: ClassificationResult
    try {
      classification = await classifyDocument(truncatedText)
    } catch (err) {
      console.error('Classification error (non-fatal):', err)
      classification = { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification call failed' }
    }

    if (!classification.is_single_fund) {
      const researchFundName = file.name.replace(/\.[^/.]+$/, '')
      const fundSlug = researchFundName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const managerId = crypto.randomUUID()

      await saveManager({ id: managerId, fund_name: researchFundName, manager_name: null, asset_class: 'Research', fund_slug: fundSlug, vintage_year: null, fund_size_mm: null, target_irr: null, management_fee_pct: null, carry_pct: null, gp_commitment_pct: null, lock_up_months: null, strategy_description: null, geography: [], sector_focus: [], team_size: null })

      const fileName = `${managerId}/${Date.now()}-${file.name}`
      await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })

      const { data: docRecord } = await saveDoc({ manager_id: managerId, doc_type: 'Other', doc_name: file.name, file_path: fileName, file_size_kb: Math.round(file.size / 1024), status: 'extracted' })
      const docId = docRecord?.id
      if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

      await saveFacts({ manager_id: managerId, doc_id: docId, irr_net: null, irr_gross: null, tvpi: null, dpi: null, moic: null, management_fee_pct: null, carry_pct: null, hurdle_rate: null, lock_up_months: null, gp_commitment_pct: null, preferred_return_pct: null, clawback_provision: null, secondary_sale_rights: null, fund_size_mm: null, target_fund_size_mm: null, deployed_capital_mm: null, committed_capital_mm: null, called_capital_mm: null, unfunded_capital_mm: null, team_founding_year: null, gp_team_size: null, key_personnel: [], investment_strategy: null, target_geographies: [], target_sectors: [], avg_ticket_size_mm: null, portfolio_concentration_pct: null, style_drift_flags: [], deployment_pace_concern: `[CLASSIFICATION: This document was identified as a ${classification.document_scope} (${classification.reasoning}). Financial extraction was skipped. Saved as Research for reference only.]`, concentration_risks: [], operational_dd_notes: null, confidence_score: 0, extraction_source: docId, fact_type: 'from_document', raw_extraction: { _classification: classification } })

      return NextResponse.json({ success: true, managerId, docId, isExisting: false, isResearchDoc: true, classificationReason: classification.reasoning, message: `Document identified as a ${classification.document_scope}. Saved as Research — no financial data extracted.` })
    }

    const autoDetectPrompt = `You are analyzing an alternative investment fund document. Extract ALL available information and return ONLY valid JSON.

VALID ASSET CLASSES (pick the closest match):
${VALID_ASSET_CLASSES.join(' | ')}

VALID DOC TYPES (pick the closest match):
${VALID_DOC_TYPES.join(' | ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUND SIZE — THREE SEPARATE FIELDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- fund_size_mm: ONLY for capital that has ACTUALLY BEEN RAISED, CLOSED, or COMMITTED.
  Words like "raised", "closed", "final close", "total commitments received" indicate this.
  If the document only shows a target/goal with no actual raised amount, set to null.
- target_fund_size_mm: ONLY for stated fundraising TARGETS — words like "targeting",
  "seeking to raise", "fund size target", "up to", "goal of", "anticipated size".
  Example: "Targeting $2 Billion of Third-Party Capital" → target_fund_size_mm=2000, fund_size_mm=null.
  Set to null if fund is already fully closed and no separate target is mentioned.
- deployed_capital_mm: Capital actually INVESTED into portfolio companies/assets to date.
  Different from called/committed — it is actual dollars put to work in investments.
  Look for "deployed", "invested to date", sum of individual deal sizes disclosed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRR — TARGETS vs. REALIZED PERFORMANCE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- irr_net and irr_gross: STRICTLY for REALIZED historical performance only.
  Fund must have meaningful realized exits or sufficient history (2+ years with exits).
  If fund is still early-stage (< 2 years old, or no exits yet), set BOTH to null.
  DO NOT put forward-looking targets into these fields.
- target_irr: For stated return TARGETS only ("targeting 16-18% net IRR").
  If a range is given (e.g. "16-18%"), use the midpoint as a decimal (0.17).
  A fund still deploying with no exits → target goes into target_irr, irr_net/irr_gross = null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. FUND-LEVEL vs FIRM-LEVEL: Extract only for THIS SPECIFIC FUND — never firm-wide AUM.
   "Firm AUM", "Platform AUM", "Total AUM" are firm-level and must NOT go in any fund_size field.
2. SANITY CHECK: Most private funds are under $20B. If fund_size_mm would exceed $20,000M, set null.
   Exception: interval funds and non-traded BDCs/REITs can legitimately exceed $20B.
3. UNITS: All _mm fields in millions. "$1.2 billion" → 1200. "$400 million" → 400.
4. DECIMALS: management_fee_pct of "1.75%" is 0.0175, not 1.75. Always verify decimal placement.
5. SOURCE QUOTING (MANDATORY): Provide exact sentence/phrase verbatim for each field. If no clear
   textual source exists, set value to null — do not guess.
6. CONFIDENCE: "H" = explicitly stated for this fund. "M" = stated with ambiguity. "L" = meaningful doubt.

Return this exact JSON structure (use null for anything not found):
{
  "fund_name": "exact fund name from document",
  "manager_name": "GP or management company name",
  "asset_class": "one of the valid asset classes above",
  "doc_type": "one of the valid doc types above",
  "vintage_year": number or null,
  "investment_strategy": "brief description",
  "target_geographies": ["list"],
  "target_sectors": ["list"],
  "key_personnel": ["list of key people and roles"],
  "gp_team_size": number or null,
  "style_drift_flags": ["list"],
  "concentration_risks": ["list"],
  "deployment_pace_concern": "string or null",
  "confidence_score": 0.0-1.0,
  "fields": {
    "fund_size_mm": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "target_fund_size_mm": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "deployed_capital_mm": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "target_irr": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "irr_net": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "irr_gross": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "tvpi": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "dpi": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "moic": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "management_fee_pct": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "carry_pct": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "gp_commitment_pct": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "hurdle_rate": { "value": decimal_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "lock_up_months": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "committed_capital_mm": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
    "called_capital_mm": { "value": number_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" }
  }
}

Document content:
---
${truncatedText}
---

Return ONLY valid JSON. No preamble, no explanation.`

    let aiResult: Record<string, any> = {}
    try {
      const response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: autoDetectPrompt }] })
      const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      try { aiResult = JSON.parse(responseText) } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) aiResult = JSON.parse(match[0])
        else throw new Error('Could not parse AI response as JSON')
      }
    } catch (err: any) {
      const isRequestTooLarge = err?.status === 413 || /too large|request entity/i.test(err?.message || '')
      return NextResponse.json({ error: isRequestTooLarge ? 'This document is too large for AI processing.' : `AI extraction failed: ${err?.message || 'Unknown error'}` }, { status: isRequestTooLarge ? 413 : 500 })
    }

    const flatFacts: Record<string, any> = {
      fund_name: aiResult.fund_name ?? null,
      manager_name: aiResult.manager_name ?? null,
      asset_class: aiResult.asset_class ?? null,
      doc_type: aiResult.doc_type ?? null,
      vintage_year: aiResult.vintage_year ?? null,
      investment_strategy: aiResult.investment_strategy ?? null,
      target_geographies: aiResult.target_geographies ?? [],
      target_sectors: aiResult.target_sectors ?? [],
      key_personnel: aiResult.key_personnel ?? [],
      gp_team_size: aiResult.gp_team_size ?? null,
      style_drift_flags: aiResult.style_drift_flags ?? [],
      concentration_risks: aiResult.concentration_risks ?? [],
      deployment_pace_concern: aiResult.deployment_pace_concern ?? null,
      confidence_score: aiResult.confidence_score ?? 0.5,
    }

    const fieldConfidence: Record<string, 'H' | 'M' | 'L' | null> = {}
    const fieldSourceQuotes: Record<string, string | null> = {}
    const quoteVerificationFailures: string[] = []
    const attributionFailures: string[] = []
    const detectedFundName = aiResult.fund_name ?? classification.fund_name_detected ?? null
    const fields = aiResult.fields || {}

    for (const fieldName of QUOTE_REQUIRED_FIELDS) {
      const fieldData = fields[fieldName]
      if (!fieldData) { flatFacts[fieldName] = null; fieldConfidence[fieldName] = null; continue }

      let { value, confidence, source_quote } = fieldData

      if (value != null && source_quote) {
        const quoteFound = verifySourceQuote(source_quote, truncatedText)
        if (!quoteFound) {
          confidence = 'L'
          quoteVerificationFailures.push(fieldName)
        } else {
          const attributionPassed = checkAttribution(detectedFundName, source_quote, value)
          if (!attributionPassed) { value = null; confidence = null; attributionFailures.push(fieldName) }
        }
      } else if (value != null && !source_quote) {
        confidence = 'L'
      }

      flatFacts[fieldName] = value ?? null
      fieldConfidence[fieldName] = value != null ? confidence : null
      fieldSourceQuotes[fieldName] = source_quote ?? null
    }

    const { facts: validatedFacts, issues } = validateExtraction(flatFacts)
    const concerns: string[] = []
    if (validatedFacts.deployment_pace_concern) concerns.push(validatedFacts.deployment_pace_concern)
    if (quoteVerificationFailures.length) concerns.push(`[QUOTE VERIFICATION: Could not verify source text for: ${quoteVerificationFailures.join(', ')}. Confidence demoted to Low.]`)
    if (attributionFailures.length) concerns.push(`[ATTRIBUTION: Values for ${attributionFailures.join(', ')} were nulled — source quote did not attribute to this fund.]`)
    const validationSummary = formatIssuesForStorage(issues)
    if (validationSummary) concerns.push(validationSummary)
    if (wasTruncated) concerns.push(`[NOTE: Document exceeded ${MAX_CHARS} characters and was truncated.]`)
    validatedFacts.deployment_pace_concern = concerns.length ? concerns.join(' ') : null
    for (const issue of issues) { if (fieldConfidence[issue.field] !== undefined) fieldConfidence[issue.field] = 'L' }

    const extractedFacts = validatedFacts
    const assetClass = VALID_ASSET_CLASSES.includes(extractedFacts.asset_class) ? extractedFacts.asset_class : 'Opportunistic'
    const docType = VALID_DOC_TYPES.includes(extractedFacts.doc_type) ? extractedFacts.doc_type : 'Other'

    function normalizeName(name: string): string {
      return name.toLowerCase().replace(/\b(the|of|and|llc|lp|inc|ltd|fund|capital|partners|advisors|management|group|private|equity|credit|investments?)\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    }
    function wordOverlap(a: string, b: string): number {
      const wordsA = a.split(' ').filter(w => w.length > 1); const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
      if (!wordsA.length) return 0; return wordsA.filter(w => wordsB.has(w)).length / wordsA.length
    }
    function isStrongMatch(name1: string, name2: string): boolean {
      if (!name1 || !name2) return false; const n1 = normalizeName(name1); const n2 = normalizeName(name2)
      if (!n1 || !n2) return false; if (n1 === n2) return true
      return wordOverlap(n1, n2) >= 0.7 && wordOverlap(n2, n1) >= 0.7
    }

    let managerId: string
    let isExisting = false
    const { data: existingManagers } = await supabase.from('alt_managers').select('id, fund_name, manager_name, asset_class')

    if (existingManagers?.length && extractedFacts.fund_name) {
      for (const existing of existingManagers) {
        const fundMatch = isStrongMatch(extractedFacts.fund_name, existing.fund_name)
        const managerMatch = extractedFacts.manager_name && existing.manager_name && existing.asset_class === assetClass && isStrongMatch(extractedFacts.manager_name, existing.manager_name)
        if (fundMatch || managerMatch) { managerId = existing.id; isExisting = true; break }
      }
    }

    if (!isExisting) {
      const fundSlug = (extractedFacts.fund_name || `unknown-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      managerId = crypto.randomUUID()
      const { error: managerError } = await saveManager({ id: managerId, fund_name: extractedFacts.fund_name || file.name.replace(/\.[^/.]+$/, ''), manager_name: extractedFacts.manager_name || null, asset_class: assetClass, fund_slug: fundSlug, vintage_year: extractedFacts.vintage_year || null, fund_size_mm: extractedFacts.fund_size_mm || null, target_irr: extractedFacts.target_irr || null, management_fee_pct: extractedFacts.management_fee_pct || null, carry_pct: extractedFacts.carry_pct || null, gp_commitment_pct: extractedFacts.gp_commitment_pct || null, lock_up_months: extractedFacts.lock_up_months || null, strategy_description: extractedFacts.investment_strategy || null, geography: extractedFacts.target_geographies || [], sector_focus: extractedFacts.target_sectors || [], team_size: extractedFacts.gp_team_size || null })
      if (managerError) return NextResponse.json({ error: `Failed to create manager: ${managerError.message}` }, { status: 500 })
    }

    const fileName = `${managerId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })
    if (uploadError) console.error('Storage error:', uploadError)

    const { data: docRecord, error: docError } = await saveDoc({ manager_id: managerId, doc_type: docType, doc_name: file.name, file_path: fileName, file_size_kb: Math.round(file.size / 1024), status: 'extracted' })
    if (docError) return NextResponse.json({ error: `Failed to create doc record: ${docError.message}` }, { status: 500 })

    const docId = docRecord?.id
    if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

    const { error: factsError } = await saveFacts({
      manager_id: managerId, doc_id: docId,
      irr_net: extractedFacts.irr_net || null, irr_gross: extractedFacts.irr_gross || null,
      tvpi: extractedFacts.tvpi || null, dpi: extractedFacts.dpi || null, moic: extractedFacts.moic || null,
      management_fee_pct: extractedFacts.management_fee_pct || null, carry_pct: extractedFacts.carry_pct || null,
      hurdle_rate: extractedFacts.hurdle_rate || null, lock_up_months: extractedFacts.lock_up_months || null,
      gp_commitment_pct: extractedFacts.gp_commitment_pct || null,
      preferred_return_pct: null, clawback_provision: null, secondary_sale_rights: null,
      fund_size_mm: extractedFacts.fund_size_mm || null,
      target_fund_size_mm: extractedFacts.target_fund_size_mm || null,
      deployed_capital_mm: extractedFacts.deployed_capital_mm || null,
      committed_capital_mm: extractedFacts.committed_capital_mm || null,
      called_capital_mm: extractedFacts.called_capital_mm || null,
      unfunded_capital_mm: null, team_founding_year: null,
      gp_team_size: extractedFacts.gp_team_size || null, key_personnel: extractedFacts.key_personnel || [],
      investment_strategy: extractedFacts.investment_strategy || null,
      target_geographies: extractedFacts.target_geographies || [], target_sectors: extractedFacts.target_sectors || [],
      avg_ticket_size_mm: null, portfolio_concentration_pct: null,
      style_drift_flags: extractedFacts.style_drift_flags || [],
      deployment_pace_concern: extractedFacts.deployment_pace_concern || null,
      concentration_risks: extractedFacts.concentration_risks || [],
      operational_dd_notes: null, confidence_score: extractedFacts.confidence_score || 0.8,
      extraction_source: docId, fact_type: 'from_document',
      raw_extraction: { ...extractedFacts, _classification: classification, _field_confidence: fieldConfidence, _field_source_quotes: fieldSourceQuotes, _attribution_failures: attributionFailures, _validation_issues: issues },
    })
    if (factsError) console.error('Facts save error:', factsError)

    return NextResponse.json({ success: true, managerId, docId, isExisting, extractedFacts: { ...extractedFacts, asset_class: assetClass, doc_type: docType }, fieldConfidence, fieldSourceQuotes, attributionFailures, validationIssues: issues, message: 'Document uploaded and extracted successfully' })

  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

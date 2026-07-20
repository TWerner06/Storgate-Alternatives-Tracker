// app/api/alt/upload-to-fund/route.ts
// Upload a document directly to a specific fund — no fuzzy matching needed.
// Includes:
//   - Layer 1: Document classification gate
//   - Layer 2: Fund-name attribution check
//   - Improved quote verification (multi-window, handles table text)
//   - target_fund_size_mm / deployed_capital_mm / IRR target vs realized distinction

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, saveFacts } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'
import { validateExtraction, formatIssuesForStorage, verifySourceQuote } from '@/lib/extraction-validator'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const VALID_DOC_TYPES = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']

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

  const response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: classifyPrompt }] })
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
    const managerId = formData.get('managerId') as string

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!managerId) return NextResponse.json({ error: 'No managerId provided' }, { status: 400 })

    const MAX_FILE_SIZE_MB = 20
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) return NextResponse.json({ error: `File is ${fileSizeMB.toFixed(1)}MB, which exceeds the ${MAX_FILE_SIZE_MB}MB limit.` }, { status: 413 })

    const { data: manager, error: managerError } = await supabase.from('alt_managers').select('id, fund_name, asset_class').eq('id', managerId).single()
    if (managerError || !manager) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })

    let extractedText = ''
    let pageCount = 0
    try {
      const { text, metadata } = await extractDocumentText(await file.arrayBuffer(), file.name)
      extractedText = cleanTextForExtraction(text)
      pageCount = (metadata.pages as number) || 0
    } catch (err) {
      return NextResponse.json({ error: `Text extraction failed: ${(err as Error).message}` }, { status: 500 })
    }

    if (extractedText.trim().length < 200 && pageCount > 0) return NextResponse.json({ error: `This document appears to contain mostly images or scanned pages. Try a text-based document or run OCR first.` }, { status: 422 })

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
      const fileName = `${managerId}/${Date.now()}-${file.name}`
      await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })
      const { data: docRecord } = await saveDoc({ manager_id: managerId, doc_type: 'Other', doc_name: file.name, file_path: fileName, file_size_kb: Math.round(file.size / 1024), status: 'extracted' })
      const docId = docRecord?.id
      if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)
      await saveFacts({ manager_id: managerId, doc_id: docId, irr_net: null, irr_gross: null, tvpi: null, dpi: null, moic: null, management_fee_pct: null, carry_pct: null, hurdle_rate: null, lock_up_months: null, gp_commitment_pct: null, preferred_return_pct: null, clawback_provision: null, secondary_sale_rights: null, fund_size_mm: null, target_fund_size_mm: null, deployed_capital_mm: null, committed_capital_mm: null, called_capital_mm: null, unfunded_capital_mm: null, team_founding_year: null, gp_team_size: null, key_personnel: [], investment_strategy: null, target_geographies: [], target_sectors: [], avg_ticket_size_mm: null, portfolio_concentration_pct: null, style_drift_flags: [], deployment_pace_concern: `[CLASSIFICATION: This document was identified as a ${classification.document_scope} (${classification.reasoning}). Financial extraction was skipped — document saved for reference only.]`, concentration_risks: [], operational_dd_notes: null, confidence_score: 0, extraction_source: docId, fact_type: 'from_document', raw_extraction: { _classification: classification } })
      return NextResponse.json({ success: true, docId, managerId, isResearchDoc: true, classificationReason: classification.reasoning, message: `Document identified as a ${classification.document_scope}. Saved for reference — no financial data extracted.` })
    }

    const prompt = `You are analyzing an alternative investment fund document for ${manager.fund_name} (${manager.asset_class}).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUND SIZE — THREE SEPARATE FIELDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- fund_size_mm: ONLY for capital that has ACTUALLY BEEN RAISED, CLOSED, or COMMITTED.
  If document only shows a target/goal with no actual raised amount, set to null.
- target_fund_size_mm: ONLY for stated fundraising TARGETS ("targeting", "seeking to raise",
  "fund size target", "up to", "goal of"). Set null if fund already fully closed.
- deployed_capital_mm: Capital actually INVESTED into portfolio companies/assets to date.
  Different from called/committed — actual dollars put to work.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRR — TARGETS vs. REALIZED PERFORMANCE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- irr_net and irr_gross: STRICTLY for REALIZED historical performance only.
  If fund is early-stage (< 2 years, no exits), set BOTH to null.
- target_irr: For stated return TARGETS only. Use midpoint of any range (16-18% → 0.17).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Only extract data for ${manager.fund_name} — never firm-wide AUM.
2. Sanity check: fund_size_mm > $20,000M → almost certainly firm-level, set null.
   Exception: interval funds and non-traded BDCs/REITs can exceed $20B.
3. All _mm fields in millions. "$1.2 billion" → 1200.
4. management_fee_pct: "1.75%" → 0.0175 (not 1.75). Check decimal placement.
5. SOURCE QUOTING (MANDATORY): Exact verbatim sentence for each field, or set null.
6. CONFIDENCE: "H" = explicitly stated, "M" = some ambiguity, "L" = meaningful doubt.

Return ONLY valid JSON:
{
  "doc_type": "PPM | DDQ | Audited Financials | Quarterly Letter | Tear Sheet | Other",
  "investment_strategy": "brief description" or null,
  "target_geographies": ["list"] or [],
  "target_sectors": ["list"] or [],
  "key_personnel": ["list"] or [],
  "gp_team_size": number or null,
  "style_drift_flags": ["list"] or [],
  "concentration_risks": ["list"] or [],
  "deployment_pace_concern": "string" or null,
  "confidence_score": 0.0-1.0,
  "vintage_year": number or null,
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

Document:
---
${truncatedText}
---

Return ONLY valid JSON.`

    let aiResult: Record<string, any> = {}
    try {
      const response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
      const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      try { aiResult = JSON.parse(responseText) } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) aiResult = JSON.parse(match[0])
      }
    } catch (err: any) {
      console.error('AI extraction error:', err)
      const isRequestTooLarge = err?.status === 413 || /too large|request entity/i.test(err?.message || '')
      if (isRequestTooLarge) return NextResponse.json({ error: 'This document is too large for AI processing.' }, { status: 413 })
    }

    const flatFacts: Record<string, any> = {
      investment_strategy: aiResult.investment_strategy ?? null,
      target_geographies: aiResult.target_geographies ?? [],
      target_sectors: aiResult.target_sectors ?? [],
      key_personnel: aiResult.key_personnel ?? [],
      gp_team_size: aiResult.gp_team_size ?? null,
      style_drift_flags: aiResult.style_drift_flags ?? [],
      concentration_risks: aiResult.concentration_risks ?? [],
      deployment_pace_concern: aiResult.deployment_pace_concern ?? null,
      confidence_score: aiResult.confidence_score ?? 0.5,
      vintage_year: aiResult.vintage_year ?? null,
    }

    const fieldConfidence: Record<string, 'H' | 'M' | 'L' | null> = {}
    const fieldSourceQuotes: Record<string, string | null> = {}
    const quoteVerificationFailures: string[] = []
    const attributionFailures: string[] = []
    const fields = aiResult.fields || {}

    for (const fieldName of QUOTE_REQUIRED_FIELDS) {
      const fieldData = fields[fieldName]
      if (!fieldData) { flatFacts[fieldName] = null; fieldConfidence[fieldName] = null; continue }

      let { value, confidence, source_quote } = fieldData

      if (value != null && source_quote) {
        const quoteFound = verifySourceQuote(source_quote, truncatedText)
        if (!quoteFound) {
          confidence = 'L'; quoteVerificationFailures.push(fieldName)
        } else {
          const attributionPassed = checkAttribution(manager.fund_name, source_quote, value)
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
    if (attributionFailures.length) concerns.push(`[ATTRIBUTION: Values for ${attributionFailures.join(', ')} were nulled — source quote did not attribute to ${manager.fund_name}.]`)
    const validationSummary = formatIssuesForStorage(issues)
    if (validationSummary) concerns.push(validationSummary)
    if (wasTruncated) concerns.push(`[NOTE: Document exceeded ${MAX_CHARS} characters and was truncated.]`)
    validatedFacts.deployment_pace_concern = concerns.length ? concerns.join(' ') : null
    for (const issue of issues) { if (fieldConfidence[issue.field] !== undefined) fieldConfidence[issue.field] = 'L' }

    const extractedFacts = validatedFacts
    const docType = VALID_DOC_TYPES.includes(aiResult.doc_type) ? aiResult.doc_type : 'Other'

    const fileName = `${managerId}/${Date.now()}-${file.name}`
    await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })

    const { data: docRecord, error: docError } = await saveDoc({ manager_id: managerId, doc_type: docType, doc_name: file.name, file_path: fileName, file_size_kb: Math.round(file.size / 1024), status: 'extracted' })
    if (docError) return NextResponse.json({ error: `Failed to create doc record: ${docError.message}` }, { status: 500 })

    const docId = docRecord?.id
    if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

    await saveFacts({
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

    return NextResponse.json({ success: true, docId, managerId, docType, fieldConfidence, fieldSourceQuotes, attributionFailures, validationIssues: issues })

  } catch (err) {
    console.error('Upload-to-fund error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

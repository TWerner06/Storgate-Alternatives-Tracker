// app/api/alt/re-extract/route.ts
// Re-runs extraction pipeline on already-uploaded documents using stored text.
// Accepts:
//   { managerId: string }  — re-extracts all docs for one fund
//   { all: true }          — re-extracts all docs across all funds
//
// For each doc:
//   1. Loads stored extracted_text from alt_docs
//   2. Runs Layer 1 classification gate
//   3. Runs AI extraction with field-level confidence
//   4. Runs Layer 2 attribution check on source quotes
//   5. Deletes old alt_facts rows for that doc
//   6. Inserts clean new facts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { validateExtraction, formatIssuesForStorage } from '@/lib/extraction-validator'

// Service role client — needed for deleting and reinserting facts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const VALID_DOC_TYPES = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']

const QUOTE_REQUIRED_FIELDS = [
  'fund_size_mm', 'target_irr', 'irr_net', 'irr_gross', 'tvpi', 'dpi', 'moic',
  'management_fee_pct', 'carry_pct', 'gp_commitment_pct', 'hurdle_rate', 'lock_up_months',
]

// ── Layer 1: Classification ───────────────────────────────────────────────────
type ClassificationResult = {
  is_single_fund: boolean
  document_scope: 'single_fund' | 'multi_fund' | 'market_report' | 'other'
  fund_name_detected: string | null
  reasoning: string
}

async function classifyDocument(text: string): Promise<ClassificationResult> {
  const prompt = `You are classifying an alternative investment document. Determine whether this is a SINGLE fund document or a MULTI-FUND/MARKET document.

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
    messages: [{ role: 'user', content: prompt }],
  })

  const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  try {
    return JSON.parse(responseText)
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    return { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification failed — defaulting to single fund' }
  }
}

// ── Layer 2: Attribution check ────────────────────────────────────────────────
function checkAttribution(fundName: string | null, sourceQuote: string | null, fieldValue: any): boolean {
  if (!fundName || !sourceQuote || fieldValue == null) return true

  const normalizedQuote = sourceQuote.toLowerCase()
  const stopWords = new Set(['the', 'of', 'and', 'llc', 'lp', 'inc', 'ltd', 'fund',
    'capital', 'partners', 'advisors', 'management', 'group', 'private'])
  const fundKeywords = fundName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))

  const aggregateRedFlags = [
    'total aum', 'total assets under management', 'platform aum', 'firm aum',
    'firm-wide', 'firmwide', 'across all funds', 'across our funds',
    'aggregate', 'combined', 'total across', 'universe', 'industry',
    'average of', 'median of', 'all funds', 'peer group',
    'total fund size across', 'funds under management',
  ]

  for (const flag of aggregateRedFlags) {
    if (normalizedQuote.includes(flag)) return false
  }

  if (fundKeywords.length > 0) {
    const hasKeyword = fundKeywords.some(kw => normalizedQuote.includes(kw))
    const genericFundRefs = ['the fund', 'this fund', 'the partnership', 'the vehicle']
    const hasGenericRef = genericFundRefs.some(ref => normalizedQuote.includes(ref))
    if (!hasKeyword && !hasGenericRef && normalizedQuote.length > 50) return false
  }

  return true
}

// ── Core re-extraction for a single doc ──────────────────────────────────────
async function reExtractDoc(doc: any, fundName: string, assetClass: string): Promise<{
  success: boolean
  docId: string
  docName: string
  skipped?: boolean
  skipReason?: string
  attributionFailures?: string[]
  error?: string
}> {
  const docId = doc.id
  const docName = doc.doc_name
  const extractedText = doc.extracted_text

  if (!extractedText || extractedText.trim().length < 200) {
    return { success: false, docId, docName, skipped: true, skipReason: 'No stored extracted text' }
  }

  const truncatedText = extractedText.substring(0, 180000)

  // Layer 1 — classify
  let classification: ClassificationResult
  try {
    classification = await classifyDocument(truncatedText)
  } catch {
    classification = { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification failed' }
  }

  // Delete old facts for this doc regardless — we'll replace with clean data
  await supabase.from('alt_facts').delete().eq('doc_id', docId)

  if (!classification.is_single_fund) {
    // Multi-fund doc — save null facts with explanation
    await supabase.from('alt_facts').insert({
      manager_id: doc.manager_id,
      doc_id: docId,
      confidence_score: 0,
      deployment_pace_concern: `[RE-EXTRACT CLASSIFICATION: Identified as ${classification.document_scope}. ${classification.reasoning}. Financial extraction skipped.]`,
      fact_type: 'from_document',
      extraction_source: docId,
      key_personnel: [],
      target_geographies: [],
      target_sectors: [],
      style_drift_flags: [],
      concentration_risks: [],
      raw_extraction: { _classification: classification },
    })

    return { success: true, docId, docName, skipped: true, skipReason: `Classified as ${classification.document_scope} — ${classification.reasoning}` }
  }

  // Layer 1 passed — run AI extraction
  const prompt = `You are analyzing an alternative investment fund document for ${fundName} (${assetClass}).

⚠️ CRITICAL RULES:
1. Only extract fund_size_mm for THIS SPECIFIC FUND (${fundName}) — never firm-wide AUM.
   If you only find a firm-wide figure, set fund_size_mm to null.
2. Most fund vehicles are under $20,000M. If a number exceeds that, set fund_size_mm to null.
   Exception: interval funds and non-traded BDCs/REITs can legitimately exceed $20B.
3. SOURCE QUOTING (MANDATORY): For each field, provide the exact sentence from the document
   the value came from, verbatim. If no clear source, set value to null.
4. CONFIDENCE: "H" = explicitly stated for this fund, "M" = some ambiguity, "L" = meaningful doubt.

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
    "fund_size_mm": { "value": number_in_millions_or_null, "confidence": "H|M|L", "source_quote": "exact sentence or null" },
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    try {
      aiResult = JSON.parse(responseText)
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) aiResult = JSON.parse(match[0])
    }
  } catch (err: any) {
    return { success: false, docId, docName, error: `AI extraction failed: ${err?.message}` }
  }

  // Flatten + quote verification + attribution
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
    if (!fieldData) {
      flatFacts[fieldName] = null
      fieldConfidence[fieldName] = null
      continue
    }

    let { value, confidence, source_quote } = fieldData

    if (value != null && source_quote) {
      const normalizedQuote = source_quote.replace(/\s+/g, ' ').trim().toLowerCase()
      const normalizedDoc = truncatedText.replace(/\s+/g, ' ').toLowerCase()
      const quoteFound = normalizedQuote.length > 5 &&
        normalizedDoc.includes(normalizedQuote.substring(0, Math.min(normalizedQuote.length, 80)))

      if (!quoteFound) {
        confidence = 'L'
        quoteVerificationFailures.push(fieldName)
      } else {
        // Layer 2 — attribution check
        const attributionPassed = checkAttribution(fundName, source_quote, value)
        if (!attributionPassed) {
          value = null
          confidence = null
          attributionFailures.push(fieldName)
        }
      }
    } else if (value != null && !source_quote) {
      confidence = 'L'
    }

    flatFacts[fieldName] = value ?? null
    fieldConfidence[fieldName] = value != null ? confidence : null
    fieldSourceQuotes[fieldName] = source_quote ?? null
  }

  // Cross-field validation
  const { facts: validatedFacts, issues } = validateExtraction(flatFacts)
  const validationSummary = formatIssuesForStorage(issues)

  const concerns: string[] = []
  if (validatedFacts.deployment_pace_concern) concerns.push(validatedFacts.deployment_pace_concern)
  if (quoteVerificationFailures.length) concerns.push(`[QUOTE VERIFICATION: Could not verify source text for: ${quoteVerificationFailures.join(', ')}.]`)
  if (attributionFailures.length) concerns.push(`[ATTRIBUTION: Values for ${attributionFailures.join(', ')} nulled — not clearly attributed to ${fundName}.]`)
  if (validationSummary) concerns.push(validationSummary)
  validatedFacts.deployment_pace_concern = concerns.length ? concerns.join(' ') : null

  for (const issue of issues) {
    if (fieldConfidence[issue.field] !== undefined) fieldConfidence[issue.field] = 'L'
  }

  const docType = VALID_DOC_TYPES.includes(aiResult.doc_type) ? aiResult.doc_type : doc.doc_type || 'Other'

  // Update doc_type on the doc record if it changed
  await supabase.from('alt_docs').update({ doc_type: docType }).eq('id', docId)

  // Insert clean facts
  await supabase.from('alt_facts').insert({
    manager_id: doc.manager_id,
    doc_id: docId,
    irr_net: validatedFacts.irr_net || null,
    irr_gross: validatedFacts.irr_gross || null,
    tvpi: validatedFacts.tvpi || null,
    dpi: validatedFacts.dpi || null,
    moic: validatedFacts.moic || null,
    management_fee_pct: validatedFacts.management_fee_pct || null,
    carry_pct: validatedFacts.carry_pct || null,
    hurdle_rate: validatedFacts.hurdle_rate || null,
    lock_up_months: validatedFacts.lock_up_months || null,
    gp_commitment_pct: validatedFacts.gp_commitment_pct || null,
    preferred_return_pct: null,
    clawback_provision: null,
    secondary_sale_rights: null,
    fund_size_mm: validatedFacts.fund_size_mm || null,
    committed_capital_mm: validatedFacts.committed_capital_mm || null,
    called_capital_mm: validatedFacts.called_capital_mm || null,
    unfunded_capital_mm: null,
    team_founding_year: null,
    gp_team_size: validatedFacts.gp_team_size || null,
    key_personnel: validatedFacts.key_personnel || [],
    investment_strategy: validatedFacts.investment_strategy || null,
    target_geographies: validatedFacts.target_geographies || [],
    target_sectors: validatedFacts.target_sectors || [],
    avg_ticket_size_mm: null,
    portfolio_concentration_pct: null,
    style_drift_flags: validatedFacts.style_drift_flags || [],
    deployment_pace_concern: validatedFacts.deployment_pace_concern || null,
    concentration_risks: validatedFacts.concentration_risks || [],
    operational_dd_notes: null,
    confidence_score: validatedFacts.confidence_score || 0.5,
    extraction_source: docId,
    fact_type: 'from_document',
    raw_extraction: {
      ...validatedFacts,
      _classification: classification,
      _field_confidence: fieldConfidence,
      _field_source_quotes: fieldSourceQuotes,
      _attribution_failures: attributionFailures,
      _validation_issues: issues,
    },
  })

  return { success: true, docId, docName, attributionFailures }
}

// ── Main route handler ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { managerId, all } = body

    if (!managerId && !all) {
      return NextResponse.json({ error: 'Provide either managerId or all: true' }, { status: 400 })
    }

    // Load the managers we're re-extracting for
    let managers: any[] = []

    if (all) {
      const { data, error } = await supabase.from('alt_managers').select('id, fund_name, asset_class')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      managers = data || []
    } else {
      const { data, error } = await supabase
        .from('alt_managers')
        .select('id, fund_name, asset_class')
        .eq('id', managerId)
        .single()
      if (error || !data) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
      managers = [data]
    }

    const results: any[] = []
    let totalProcessed = 0
    let totalSkipped = 0
    let totalFailed = 0

    for (const manager of managers) {
      // Load all docs for this manager that have stored extracted text
      const { data: docs, error: docsError } = await supabase
        .from('alt_docs')
        .select('id, doc_name, doc_type, manager_id, extracted_text')
        .eq('manager_id', manager.id)
        .not('extracted_text', 'is', null)
        .order('created_at', { ascending: true })

      if (docsError || !docs?.length) {
        results.push({
          managerId: manager.id,
          fundName: manager.fund_name,
          docs: [],
          note: 'No documents with stored text found',
        })
        continue
      }

      const docResults = []
      for (const doc of docs) {
        try {
          const result = await reExtractDoc(doc, manager.fund_name, manager.asset_class)
          docResults.push(result)
          if (result.skipped) totalSkipped++
          else if (result.success) totalProcessed++
          else totalFailed++
        } catch (err: any) {
          docResults.push({ success: false, docId: doc.id, docName: doc.doc_name, error: err.message })
          totalFailed++
        }
      }

      results.push({
        managerId: manager.id,
        fundName: manager.fund_name,
        docs: docResults,
      })
    }

    return NextResponse.json({
      success: true,
      summary: {
        managersProcessed: managers.length,
        docsProcessed: totalProcessed,
        docsSkipped: totalSkipped,
        docsFailed: totalFailed,
      },
      results,
    })

  } catch (err) {
    console.error('Re-extract error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

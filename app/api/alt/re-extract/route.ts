// app/api/alt/re-extract/route.ts
// Re-runs extraction pipeline on already-uploaded documents using stored text.
// Accepts:
//   { managerId: string }  — re-extracts all docs for one fund
//   { all: true }          — re-extracts all docs across all funds
//
// Changes from v1:
//   - Uses verifySourceQuote from extraction-validator (multi-window, table-safe)
//   - Attribution check loosened for short quotes (<100 chars) — table rows don't
//     contain fund names but are clearly fund-specific
//   - New fields: target_fund_size_mm, deployed_capital_mm
//   - Fund size/IRR target vs realized distinction in prompt
//   - Updates alt_managers.fund_size_mm after re-extraction to fix Dashboard total

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { validateExtraction, formatIssuesForStorage, verifySourceQuote } from '@/lib/extraction-validator'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const VALID_DOC_TYPES = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']

const QUOTE_REQUIRED_FIELDS = [
  'fund_size_mm', 'target_fund_size_mm', 'deployed_capital_mm',
  'target_irr', 'irr_net', 'irr_gross', 'tvpi', 'dpi', 'moic',
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
    return { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification failed' }
  }
}

// ── Layer 2: Attribution check ────────────────────────────────────────────────
// Verifies a source quote belongs to the specific fund, not the firm or universe.
//
// Key fix vs v1: short quotes (<100 chars) only fail if a positive aggregate red flag
// is detected. Table rows like "Management Fee: 1.5% per annum" are legitimately
// fund-specific even without the fund name in every row — we shouldn't null them.
// Only long quotes (>=100 chars) require a fund name or generic fund reference.

function checkAttribution(fundName: string | null, sourceQuote: string | null, fieldValue: any): boolean {
  if (!fundName || !sourceQuote || fieldValue == null) return true

  const normalizedQuote = sourceQuote.toLowerCase()
  const stopWords = new Set(['the', 'of', 'and', 'llc', 'lp', 'inc', 'ltd', 'fund',
    'capital', 'partners', 'advisors', 'management', 'group', 'private'])
  const fundKeywords = fundName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))

  // These phrases always indicate the quote is NOT fund-specific
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

  // For short quotes (table rows, term sheets), don't require the fund name —
  // a table row in a fund's own document is implicitly about that fund.
  // Only apply the fund-name check to longer prose quotes.
  if (normalizedQuote.length >= 100 && fundKeywords.length > 0) {
    const hasKeyword = fundKeywords.some(kw => normalizedQuote.includes(kw))
    const genericFundRefs = ['the fund', 'this fund', 'the partnership', 'the vehicle']
    const hasGenericRef = genericFundRefs.some(ref => normalizedQuote.includes(ref))
    if (!hasKeyword && !hasGenericRef) return false
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
  extractedFundSize?: number | null
  extractedTargetFundSize?: number | null
  error?: string
}> {
  const docId = doc.id
  const docName = doc.doc_name
  const extractedText = doc.extracted_text

  if (!extractedText || extractedText.trim().length < 200) {
    return { success: false, docId, docName, skipped: true, skipReason: 'No stored extracted text' }
  }

  const truncatedText = extractedText.substring(0, 180000)

  let classification: ClassificationResult
  try {
    classification = await classifyDocument(truncatedText)
  } catch {
    classification = { is_single_fund: true, document_scope: 'other', fund_name_detected: null, reasoning: 'Classification failed' }
  }

  await supabase.from('alt_facts').delete().eq('doc_id', docId)

  if (!classification.is_single_fund) {
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
    return { success: true, docId, docName, skipped: true, skipReason: `Classified as ${classification.document_scope}` }
  }

  const prompt = `You are analyzing an alternative investment fund document for ${fundName} (${assetClass}).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUND SIZE — THREE SEPARATE FIELDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- fund_size_mm: ONLY for capital that has ACTUALLY BEEN RAISED, CLOSED, or COMMITTED.
  Words like "raised", "closed", "final close", "total commitments received" indicate this.
  If document only shows a target/goal and NOT actual raised capital, set to null.
- target_fund_size_mm: ONLY for stated fundraising TARGETS — words like "targeting",
  "seeking to raise", "fund size target", "up to", "goal of", "anticipated size".
  Example: "Targeting $2 Billion of Third-Party Capital" → target_fund_size_mm=2000, fund_size_mm=null.
  Set null if fund is already fully closed with no separate target mentioned.
- deployed_capital_mm: Capital actually INVESTED into portfolio companies/assets to date.
  Different from called/committed — actual dollars put to work in investments.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRR — TARGETS vs. REALIZED PERFORMANCE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- irr_net and irr_gross: STRICTLY for REALIZED historical performance only.
  If fund is early-stage (< 2 years old, or no exits yet), set BOTH to null.
  DO NOT put forward-looking targets into these fields.
- target_irr: For stated return TARGETS only. Use midpoint of any range (16-18% → 0.17).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Only extract data for ${fundName} — never firm-wide AUM.
2. Sanity check: fund_size_mm > $100,000M → almost certainly firm-level, set null.
   Interval funds and non-traded BDCs/REITs can legitimately be $20B+.
3. All _mm fields in millions. "$1.2 billion" → 1200.
4. management_fee_pct "1.75%" → 0.0175. Check decimal placement.
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    try { aiResult = JSON.parse(responseText) } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) aiResult = JSON.parse(match[0])
    }
  } catch (err: any) {
    return { success: false, docId, docName, error: `AI extraction failed: ${err?.message}` }
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
      // Use shared verifySourceQuote — multi-window, handles table text artifacts
      const quoteFound = verifySourceQuote(source_quote, truncatedText)
      if (!quoteFound) {
        confidence = 'L'
        quoteVerificationFailures.push(fieldName)
      } else {
        const attributionPassed = checkAttribution(fundName, source_quote, value)
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
  if (quoteVerificationFailures.length) concerns.push(`[QUOTE VERIFICATION: Could not verify source text for: ${quoteVerificationFailures.join(', ')}.]`)
  if (attributionFailures.length) concerns.push(`[ATTRIBUTION: Values for ${attributionFailures.join(', ')} nulled — not clearly attributed to ${fundName}.]`)
  const validationSummary = formatIssuesForStorage(issues)
  if (validationSummary) concerns.push(validationSummary)
  validatedFacts.deployment_pace_concern = concerns.length ? concerns.join(' ') : null
  for (const issue of issues) { if (fieldConfidence[issue.field] !== undefined) fieldConfidence[issue.field] = 'L' }

  const docType = VALID_DOC_TYPES.includes(aiResult.doc_type) ? aiResult.doc_type : doc.doc_type || 'Other'
  await supabase.from('alt_docs').update({ doc_type: docType }).eq('id', docId)

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
    target_fund_size_mm: validatedFacts.target_fund_size_mm || null,
    deployed_capital_mm: validatedFacts.deployed_capital_mm || null,
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

  return {
    success: true,
    docId,
    docName,
    attributionFailures,
    extractedFundSize: validatedFacts.fund_size_mm || null,
    extractedTargetFundSize: validatedFacts.target_fund_size_mm || null,
  }
}

// ── Main route handler ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { managerId, all } = body

    if (!managerId && !all) {
      return NextResponse.json({ error: 'Provide either managerId or all: true' }, { status: 400 })
    }

    let managers: any[] = []

    if (all) {
      const { data, error } = await supabase.from('alt_managers').select('id, fund_name, asset_class')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      managers = data || []
    } else {
      const { data, error } = await supabase
        .from('alt_managers').select('id, fund_name, asset_class').eq('id', managerId).single()
      if (error || !data) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
      managers = [data]
    }

    const results: any[] = []
    let totalProcessed = 0
    let totalSkipped = 0
    let totalFailed = 0

    for (const manager of managers) {
      const { data: docs, error: docsError } = await supabase
        .from('alt_docs')
        .select('id, doc_name, doc_type, manager_id, extracted_text')
        .eq('manager_id', manager.id)
        .not('extracted_text', 'is', null)
        .order('created_at', { ascending: true })

      if (docsError || !docs?.length) {
        results.push({ managerId: manager.id, fundName: manager.fund_name, docs: [], note: 'No documents with stored text found' })
        continue
      }

      const docResults = []
      let bestFundSize: number | null = null
      let bestTargetFundSize: number | null = null

      for (const doc of docs) {
        try {
          const result = await reExtractDoc(doc, manager.fund_name, manager.asset_class)
          docResults.push(result)
          if (result.skipped) totalSkipped++
          else if (result.success) {
            totalProcessed++
            // Track the best fund size across all docs for this manager
            if (result.extractedFundSize != null && bestFundSize == null) bestFundSize = result.extractedFundSize
            if (result.extractedTargetFundSize != null && bestTargetFundSize == null) bestTargetFundSize = result.extractedTargetFundSize
          }
          else totalFailed++
        } catch (err: any) {
          docResults.push({ success: false, docId: doc.id, docName: doc.doc_name, error: err.message })
          totalFailed++
        }
      }

      // Update alt_managers with the best available fund size so Dashboard total is correct.
      // Prefer actual raised/closed size; fall back to target if that's all we have.
      const managerFundSize = bestFundSize ?? bestTargetFundSize ?? null
      if (managerFundSize !== null) {
        await supabase.from('alt_managers')
          .update({ fund_size_mm: managerFundSize, updated_at: new Date().toISOString() })
          .eq('id', manager.id)
      }

      results.push({ managerId: manager.id, fundName: manager.fund_name, docs: docResults })
    }

    return NextResponse.json({
      success: true,
      summary: { managersProcessed: managers.length, docsProcessed: totalProcessed, docsSkipped: totalSkipped, docsFailed: totalFailed },
      results,
    })

  } catch (err) {
    console.error('Re-extract error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

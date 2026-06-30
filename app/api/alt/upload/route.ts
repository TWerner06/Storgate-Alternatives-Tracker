// app/api/alt/upload/route.ts
// Auto-detection: AI identifies fund name, asset class, doc type from document content.
// Includes field-level confidence scoring, source-quote verification, and cross-field
// validation so extracted data can be trusted without manual double-checking.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, updateDocError, saveFacts, saveManager } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'
import { validateExtraction, formatIssuesForStorage } from '@/lib/extraction-validator'

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

// Fields that require source-quote verification — the AI must point to the exact
// sentence it pulled the value from, or the value is rejected. This is the single
// most effective guardrail against hallucinated or misattributed numbers.
const QUOTE_REQUIRED_FIELDS = [
  'fund_size_mm', 'target_irr', 'irr_net', 'irr_gross', 'tvpi', 'dpi', 'moic',
  'management_fee_pct', 'carry_pct', 'gp_commitment_pct', 'hurdle_rate', 'lock_up_months',
]

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 0. File size guardrail — large image-heavy PDFs (floor plans, renderings) can
    // blow past extraction/token limits and cause cryptic downstream errors.
    const MAX_FILE_SIZE_MB = 20
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: `File is ${fileSizeMB.toFixed(1)}MB, which exceeds the ${MAX_FILE_SIZE_MB}MB limit. This is often caused by image-heavy PDFs (floor plans, renderings, photos). Try compressing the PDF or removing image pages that aren't needed for underwriting.` },
        { status: 413 }
      )
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

    if (extractedText.trim().length < 200 && pageCount > 0) {
      return NextResponse.json(
        { error: `This document appears to contain mostly images or scanned pages with very little extractable text (only ${extractedText.trim().length} characters found across ${pageCount} pages). This is common with floor plans, renderings, or scanned documents. Try uploading a text-based document instead (PPM, DDQ, financial statements), or run OCR on this file first.` },
        { status: 422 }
      )
    }

    // 2. Document chunking — raised from 100K to 180K chars (~45K tokens) so longer
    // documents (full PPMs, audited financials with schedules) don't get truncated
    // before reaching the sections containing key terms, which are often near the end.
    const MAX_CHARS = 180000
    const truncatedText = extractedText.substring(0, MAX_CHARS)
    const wasTruncated = extractedText.length > MAX_CHARS

    // 3. AI auto-detection with field-level confidence + source-quote verification
    const autoDetectPrompt = `You are analyzing an alternative investment fund document. Extract ALL available information and return ONLY valid JSON.

VALID ASSET CLASSES (pick the closest match):
${VALID_ASSET_CLASSES.join(' | ')}

VALID DOC TYPES (pick the closest match):
${VALID_DOC_TYPES.join(' | ')}

⚠️ CRITICAL EXTRACTION RULES — READ CAREFULLY:

1. FUND-LEVEL vs FIRM-LEVEL DATA: Many documents mention BOTH the specific fund's metrics AND the parent firm's
   overall metrics (e.g. "Firm AUM: $31.3B" vs "Fund III Size: $400M"). You must ONLY extract data that belongs
   to THIS SPECIFIC FUND being offered, not the sponsor/manager's firm-wide totals.
   - "Firm AUM", "Total Assets Under Management", "Platform AUM", "Net Asset Value" (when referring to the firm)
     are FIRM-LEVEL and should NOT be used for fund_size_mm.
   - Look specifically for "Fund Size", "Target Fund Size", "Total Commitments", "Committed Capital" tied to
     THIS fund's name.
   - If you only find a firm-level AUM number and no fund-specific size, set fund_size_mm to null rather than
     guessing using the firm number.

2. SANITY CHECK: Most private fund vehicles range from $10M to $10,000M (i.e. $10B). If a number you are about
   to extract for fund_size_mm exceeds $20,000 (i.e. $20B), STOP and re-read the context — you have very likely
   captured a firm-wide AUM figure, an industry TAM, or misplaced a decimal. In that case, set fund_size_mm to
   null instead of guessing.

3. UNITS: fund_size_mm must ALWAYS be expressed in millions of dollars. "$400 million" → 400. "$1.2 billion" → 1200.

4. Double-check decimal placement on every percentage field. management_fee_pct of "1.75%" is 0.0175, not 1.75.

5. SOURCE QUOTING (MANDATORY for key financial fields): For each field listed below, you MUST provide the exact
   sentence or phrase from the document that the value came from, verbatim. If you cannot find a specific
   sentence stating this value clearly, set the value to null — DO NOT infer, calculate, or guess a value without
   a direct textual source. This applies to: fund_size_mm, target_irr, irr_net, irr_gross, tvpi, dpi, moic,
   management_fee_pct, carry_pct, gp_commitment_pct, hurdle_rate, lock_up_months.

6. CONFIDENCE PER FIELD: For every field with a source quote, also assign a confidence level:
   - "H" (High): The document states this value explicitly and unambiguously for THIS fund.
   - "M" (Medium): The value is stated but with some ambiguity (e.g. a range was given and you picked one end,
     or it's unclear if it's fund-level or share-class-level).
   - "L" (Low): You found a plausible value but have meaningful doubt about whether it's correct or applies to
     this specific fund.

Return this exact JSON structure (use null for anything not found):
{
  "fund_name": "exact fund name from document",
  "manager_name": "GP or management company name",
  "asset_class": "one of the valid asset classes above",
  "doc_type": "one of the valid doc types above",
  "vintage_year": number or null,
  "investment_strategy": "brief description of strategy",
  "target_geographies": ["list of geographies"],
  "target_sectors": ["list of sectors or asset types"],
  "key_personnel": ["list of key people and roles"],
  "gp_team_size": number or null,
  "style_drift_flags": ["any concerns about strategy drift"],
  "concentration_risks": ["any concentration concerns"],
  "deployment_pace_concern": "any concerns about deployment pace or null",
  "confidence_score": 0.0-1.0 based on overall document data richness,
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

Document content:
---
${truncatedText}
---

Return ONLY valid JSON. No preamble, no explanation.`

    let aiResult: Record<string, any> = {}

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: autoDetectPrompt }],
      })

      const responseText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('')

      try {
        aiResult = JSON.parse(responseText)
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) aiResult = JSON.parse(match[0])
        else throw new Error('Could not parse AI response as JSON')
      }
    } catch (err: any) {
      const isRequestTooLarge = err?.status === 413 || /too large|request entity/i.test(err?.message || '')
      const friendlyMessage = isRequestTooLarge
        ? 'This document is too large for AI processing, likely due to extensive embedded images or page count. Try a smaller or text-only version of this document.'
        : `AI extraction failed: ${err?.message || 'Unknown error'}`

      return NextResponse.json({ error: friendlyMessage }, { status: isRequestTooLarge ? 413 : 500 })
    }

    // 4. Flatten field-level structure into flat facts object + confidence map + source quotes,
    // while ALSO verifying that source quotes actually appear in the document text.
    // If a quote doesn't match the document (hallucinated citation), the value is demoted to null.
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

    const fields = aiResult.fields || {}
    for (const fieldName of QUOTE_REQUIRED_FIELDS) {
      const fieldData = fields[fieldName]
      if (!fieldData) {
        flatFacts[fieldName] = null
        fieldConfidence[fieldName] = null
        continue
      }

      let { value, confidence, source_quote } = fieldData

      // Verify the source quote actually appears in the document (normalize whitespace
      // for comparison). If the AI cited a quote that isn't actually in the text, this
      // is a strong signal of hallucination — demote confidence to L and flag it.
      if (value != null && source_quote) {
        const normalizedQuote = source_quote.replace(/\s+/g, ' ').trim().toLowerCase()
        const normalizedDoc = truncatedText.replace(/\s+/g, ' ').toLowerCase()
        const quoteFound = normalizedQuote.length > 5 && normalizedDoc.includes(normalizedQuote.substring(0, Math.min(normalizedQuote.length, 80)))

        if (!quoteFound) {
          confidence = 'L'
          quoteVerificationFailures.push(fieldName)
        }
      } else if (value != null && !source_quote) {
        // Value given with no source quote at all — cannot verify, force to Low confidence
        confidence = 'L'
      }

      flatFacts[fieldName] = value ?? null
      fieldConfidence[fieldName] = value != null ? confidence : null
      fieldSourceQuotes[fieldName] = source_quote ?? null
    }

    // 5. Run cross-field and bounds validation on the flattened facts
    const { facts: validatedFacts, issues } = validateExtraction(flatFacts)

    // Merge validation issues + quote verification failures into deployment_pace_concern
    // so they're visible without requiring a separate UI surface right away.
    const validationSummary = formatIssuesForStorage(issues)
    if (quoteVerificationFailures.length) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}[QUOTE VERIFICATION: Could not verify source text for: ${quoteVerificationFailures.join(', ')}. Confidence demoted to Low — please verify manually.]`
    }
    if (validationSummary) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}${validationSummary}`
    }
    if (wasTruncated) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}[NOTE: Document exceeded ${MAX_CHARS} characters and was truncated — some content near the end may not have been analyzed.]`
    }

    // Demote confidence to L for any field that failed bounds/cross-field validation
    for (const issue of issues) {
      if (fieldConfidence[issue.field] !== undefined) {
        fieldConfidence[issue.field] = 'L'
      }
    }

    const extractedFacts = validatedFacts

    // 6. Validate and normalize asset class
    const assetClass = VALID_ASSET_CLASSES.includes(extractedFacts.asset_class)
      ? extractedFacts.asset_class
      : 'Opportunistic'

    // 7. Validate and normalize doc type
    const docType = VALID_DOC_TYPES.includes(extractedFacts.doc_type)
      ? extractedFacts.doc_type
      : 'Other'

    // Helper: extract first N significant words for fuzzy matching
    function getKeyWords(name: string, n: number = 3): string {
      const stopWords = ['the', 'of', 'and', 'llc', 'lp', 'inc', 'ltd', 'fund', 'capital', 'partners', 'advisors', 'management', 'group', 'private']
      return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.includes(w))
        .slice(0, n)
        .join(' ')
    }

    // Normalize a name for comparison: lowercase, remove punctuation/common suffixes
    function normalizeName(name: string): string {
      return name
        .toLowerCase()
        .replace(/\b(the|of|and|llc|lp|inc|ltd|fund|capital|partners|advisors|management|group|private|equity|credit|investments?)\b/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function wordOverlap(a: string, b: string): number {
      const wordsA = a.split(' ').filter(w => w.length > 1)
      const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
      if (!wordsA.length) return 0
      const matches = wordsA.filter(w => wordsB.has(w)).length
      return matches / wordsA.length
    }

    function isStrongMatch(name1: string, name2: string): boolean {
      if (!name1 || !name2) return false
      const n1 = normalizeName(name1)
      const n2 = normalizeName(name2)
      if (!n1 || !n2) return false
      if (n1 === n2) return true
      const overlap1 = wordOverlap(n1, n2)
      const overlap2 = wordOverlap(n2, n1)
      return overlap1 >= 0.7 && overlap2 >= 0.7
    }

    // 8. Check if fund already exists using strict matching
    let managerId: string
    let isExisting = false

    const { data: existingManagers } = await supabase
      .from('alt_managers')
      .select('id, fund_name, manager_name, asset_class')

    if (existingManagers?.length && extractedFacts.fund_name) {
      for (const existing of existingManagers) {
        const fundMatch = isStrongMatch(extractedFacts.fund_name, existing.fund_name)
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

    // 9. Upload file to Supabase Storage
    const fileName = `${managerId}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('alt_documents')
      .upload(fileName, file, { upsert: false })

    if (uploadError) {
      console.error('Storage error:', uploadError)
    }

    // 10. Create document record
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

    // 11. Update doc with extracted text
    if (docId) {
      await updateDocStatus(docId, 'extracted', truncatedText, pageCount)
    }

    // 12. Save extracted facts, including field confidence + source quotes as raw_extraction metadata
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
      raw_extraction: {
        ...extractedFacts,
        _field_confidence: fieldConfidence,
        _field_source_quotes: fieldSourceQuotes,
        _validation_issues: issues,
      },
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
      fieldConfidence,
      fieldSourceQuotes,
      validationIssues: issues,
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

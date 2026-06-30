// app/api/alt/upload-to-fund/route.ts
// Upload a document directly to a specific fund — no fuzzy matching needed.
// Includes field-level confidence scoring, source-quote verification, and cross-field
// validation so extracted data can be trusted without manual double-checking.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { saveDoc, updateDocStatus, saveFacts } from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'
import { validateExtraction, formatIssuesForStorage } from '@/lib/extraction-validator'

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const managerId = formData.get('managerId') as string

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!managerId) return NextResponse.json({ error: 'No managerId provided' }, { status: 400 })

    const MAX_FILE_SIZE_MB = 20
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: `File is ${fileSizeMB.toFixed(1)}MB, which exceeds the ${MAX_FILE_SIZE_MB}MB limit. This is often caused by image-heavy PDFs. Try compressing the PDF or removing unnecessary image pages.` },
        { status: 413 }
      )
    }

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

    if (extractedText.trim().length < 200 && pageCount > 0) {
      return NextResponse.json(
        { error: `This document appears to contain mostly images or scanned pages with very little extractable text. This is common with floor plans, renderings, or scanned documents. Try a text-based document instead, or run OCR first.` },
        { status: 422 }
      )
    }

    const MAX_CHARS = 180000
    const truncatedText = extractedText.substring(0, MAX_CHARS)
    const wasTruncated = extractedText.length > MAX_CHARS

    // 2. AI extraction with field-level confidence + source-quote verification
    const prompt = `You are analyzing an alternative investment fund document for ${manager.fund_name} (${manager.asset_class}).

⚠️ CRITICAL RULES:
1. Documents often mention BOTH this specific fund's size AND the parent firm's total AUM
   (e.g. "Firm AUM: $31.3B" vs "this Fund's Size: $400M"). Only extract fund_size_mm, committed_capital_mm,
   and called_capital_mm for THIS SPECIFIC FUND (${manager.fund_name}) — never the sponsor firm's overall AUM.
   If you can only find a firm-wide figure and no fund-specific number, set fund_size_mm to null.
2. Sanity check: single fund vehicles are virtually always under $20,000M ($20B). If a number exceeds that,
   you have almost certainly grabbed a firm-level figure — set it to null instead.
3. SOURCE QUOTING (MANDATORY): For each field in the "fields" object below, provide the exact sentence or
   phrase from the document the value came from, verbatim. If you cannot find a clear textual source, set
   the value to null rather than guessing.
4. CONFIDENCE: For each field, assign "H" (explicitly and unambiguously stated for this fund), "M" (stated
   but with some ambiguity), or "L" (plausible but meaningful doubt).

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
  "target_irr_unused": null,
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

      const responseText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('')

      try {
        aiResult = JSON.parse(responseText)
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/)
        if (match) aiResult = JSON.parse(match[0])
      }
    } catch (err: any) {
      console.error('AI extraction error:', err)
      const isRequestTooLarge = err?.status === 413 || /too large|request entity/i.test(err?.message || '')
      if (isRequestTooLarge) {
        return NextResponse.json({ error: 'This document is too large for AI processing. Try a smaller or text-only version.' }, { status: 413 })
      }
      // Non-fatal for other errors — continue with empty facts
    }

    // 3. Flatten + verify source quotes against actual document text
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
        const quoteFound = normalizedQuote.length > 5 && normalizedDoc.includes(normalizedQuote.substring(0, Math.min(normalizedQuote.length, 80)))

        if (!quoteFound) {
          confidence = 'L'
          quoteVerificationFailures.push(fieldName)
        }
      } else if (value != null && !source_quote) {
        confidence = 'L'
      }

      flatFacts[fieldName] = value ?? null
      fieldConfidence[fieldName] = value != null ? confidence : null
      fieldSourceQuotes[fieldName] = source_quote ?? null
    }

    // 4. Cross-field + bounds validation
    const { facts: validatedFacts, issues } = validateExtraction(flatFacts)

    const validationSummary = formatIssuesForStorage(issues)
    if (quoteVerificationFailures.length) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}[QUOTE VERIFICATION: Could not verify source text for: ${quoteVerificationFailures.join(', ')}. Confidence demoted to Low — please verify manually.]`
    }
    if (validationSummary) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}${validationSummary}`
    }
    if (wasTruncated) {
      validatedFacts.deployment_pace_concern = `${validatedFacts.deployment_pace_concern ? validatedFacts.deployment_pace_concern + ' ' : ''}[NOTE: Document exceeded ${MAX_CHARS} characters and was truncated.]`
    }

    for (const issue of issues) {
      if (fieldConfidence[issue.field] !== undefined) {
        fieldConfidence[issue.field] = 'L'
      }
    }

    const extractedFacts = validatedFacts
    const docType = VALID_DOC_TYPES.includes(aiResult.doc_type) ? aiResult.doc_type : 'Other'

    // 5. Upload to storage
    const fileName = `${managerId}/${Date.now()}-${file.name}`
    await supabase.storage.from('alt_documents').upload(fileName, file, { upsert: false })

    // 6. Create doc record
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

    if (docId) await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

    // 7. Save facts with confidence + source quotes preserved in raw_extraction
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
      raw_extraction: {
        ...extractedFacts,
        _field_confidence: fieldConfidence,
        _field_source_quotes: fieldSourceQuotes,
        _validation_issues: issues,
      },
    })

    return NextResponse.json({
      success: true,
      docId,
      managerId,
      docType,
      fieldConfidence,
      fieldSourceQuotes,
      validationIssues: issues,
    })

  } catch (err) {
    console.error('Upload-to-fund error:', err)
    return NextResponse.json({ error: `Server error: ${(err as Error).message}` }, { status: 500 })
  }
}

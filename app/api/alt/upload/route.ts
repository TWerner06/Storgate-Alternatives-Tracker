// app/api/alt/upload/route.ts
// Handles document upload, text extraction, and AI fact extraction

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { 
  saveDoc, 
  updateDocStatus, 
  updateDocError, 
  saveFacts,
  saveManager 
} from '@/lib/supabase'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Extraction prompts per document type
const EXTRACTION_PROMPTS = {
  'PPM': `Extract structured fund information from this Private Placement Memorandum. Return ONLY valid JSON with these fields (use null for unknown):
{
  "fund_name": "exact fund name",
  "manager_name": "GP/manager name",
  "vintage_year": number,
  "asset_class": "Private Equity|Private Credit|Hedge Fund|Real Assets|Infrastructure",
  "fund_size_mm": number,
  "target_irr": decimal,
  "management_fee_pct": decimal,
  "carry_pct": decimal,
  "gp_commitment_pct": decimal,
  "lock_up_months": number,
  "investment_strategy": "description",
  "target_geographies": ["country or region"],
  "target_sectors": ["sector"],
  "team_size": number,
  "key_personnel": ["names if available"],
  "ticket_size_range": "e.g. $5M-$25M"
}`,

  'DDQ': `Extract fund details from this Due Diligence Questionnaire. Return ONLY valid JSON:
{
  "fund_name": "exact name",
  "manager_name": "GP name",
  "asset_class": "category",
  "fund_size_mm": number,
  "irr_net": decimal,
  "irr_gross": decimal,
  "tvpi": decimal,
  "dpi": decimal,
  "management_fee_pct": decimal,
  "carry_pct": decimal,
  "gp_commitment_pct": decimal,
  "team_size": number,
  "key_personnel": ["names"],
  "investment_strategy": "description"
}`,

  'Audited Financials': `Extract financial metrics from audited statements. Return ONLY valid JSON:
{
  "fund_name": "fund name",
  "irr_net": decimal,
  "irr_gross": decimal,
  "tvpi": decimal,
  "dpi": decimal,
  "moic": decimal,
  "fund_size_mm": number,
  "committed_capital_mm": number,
  "called_capital_mm": number,
  "management_fee_pct": decimal,
  "carry_pct": decimal,
  "portfolio_concentration_pct": decimal,
  "key_metrics_summary": "brief description"
}`,

  'Quarterly Letter': `Extract forward-looking insights and updates from quarterly letter. Return ONLY valid JSON:
{
  "letter_date": "YYYY-MM-DD",
  "fund_name": "fund name",
  "key_portfolio_changes": ["description of major changes"],
  "style_drift_flags": ["any mention of strategy changes"],
  "deployment_pace_concern": "if mentioned, describe pace vs plan",
  "concentration_risks": ["any concentration issues noted"],
  "management_commentary": "key forward-looking statements",
  "performance_update": "current returns if stated"
}`,

  'Other': `Extract any available fund information. Return ONLY valid JSON with available fields:
{
  "fund_name": null,
  "manager_name": null,
  "asset_class": null,
  "fund_size_mm": null,
  "investment_strategy": null,
  "extracted_data": "summary of any extractable information"
}`
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const managerId = formData.get('managerId') as string
    const docType = formData.get('docType') as string
    const userId = request.headers.get('x-user-id') as string

    if (!file || !managerId || !docType || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, managerId, docType, userId' },
        { status: 400 }
      )
    }

    const allowedDocTypes = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']
    if (!allowedDocTypes.includes(docType)) {
      return NextResponse.json(
        { error: `Invalid docType. Allowed: ${allowedDocTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // 1. Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileName = `${managerId}/${Date.now()}-${file.name}`
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('alt_documents')
      .upload(fileName, file, { upsert: false })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // 2. Create alt_docs record with 'processing' status
    const { data: docRecord, error: docError } = await saveDoc({
      manager_id: managerId,
      doc_type: docType,
      doc_name: file.name,
      file_path: fileName,
      file_size_kb: Math.round(file.size / 1024),
      status: 'processing',
    })

    if (docError) {
      console.error('Document record error:', docError)
      return NextResponse.json(
        { error: `Failed to create document record: ${docError.message}` },
        { status: 500 }
      )
    }

    const docId = docRecord.id

    // 3. Extract text from document
    let extractedText = ''
    let pageCount = 0

    try {
      const { text, metadata } = await extractDocumentText(await file.arrayBuffer(), file.name)
      extractedText = cleanTextForExtraction(text)
      pageCount = metadata.pages || 0
    } catch (extractError) {
      console.error('Text extraction error:', extractError)
      await updateDocError(docId, `Text extraction failed: ${(extractError as Error).message}`)
      return NextResponse.json(
        { error: 'Failed to extract text from document' },
        { status: 500 }
      )
    }

    // Truncate to ~100k characters for Claude
    const truncatedText = extractedText.substring(0, 100000)

    // 4. Call Claude for structured extraction
    const prompt = EXTRACTION_PROMPTS[docType as keyof typeof EXTRACTION_PROMPTS] || EXTRACTION_PROMPTS['Other']
    const extractionMessage = `${prompt}\n\nDocument content:\n---\n${truncatedText}\n---\n\nReturn ONLY valid JSON, no preamble.`

    let extractedFacts: Record<string, any> = {}
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: extractionMessage
          }
        ]
      })

      const responseText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('')

      // Try to parse JSON
      try {
        extractedFacts = JSON.parse(responseText)
      } catch (parseError) {
        // Try extracting JSON from markdown code blocks
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/)
        if (jsonMatch) {
          extractedFacts = JSON.parse(jsonMatch[1])
        } else {
          throw new Error('Could not parse Claude response as JSON')
        }
      }
    } catch (claudeError) {
      console.error('Claude extraction error:', claudeError)
      await updateDocError(docId, `AI extraction failed: ${(claudeError as Error).message}`)
      return NextResponse.json(
        { error: 'AI extraction failed' },
        { status: 500 }
      )
    }

    // 5. Store extracted text in document record
    await updateDocStatus(docId, 'extracted', truncatedText, pageCount)

    // 6. Save extracted facts to alt_facts table
    const factsRecord = {
      manager_id: managerId,
      doc_id: docId,
      irr_net: extractedFacts?.irr_net || null,
      irr_gross: extractedFacts?.irr_gross || null,
      tvpi: extractedFacts?.tvpi || null,
      dpi: extractedFacts?.dpi || null,
      moic: extractedFacts?.moic || null,
      management_fee_pct: extractedFacts?.management_fee_pct || null,
      carry_pct: extractedFacts?.carry_pct || null,
      gp_commitment_pct: extractedFacts?.gp_commitment_pct || null,
      hurdle_rate: null,
      lock_up_months: extractedFacts?.lock_up_months || null,
      preferred_return_pct: null,
      clawback_provision: null,
      secondary_sale_rights: null,
      fund_size_mm: extractedFacts?.fund_size_mm || null,
      committed_capital_mm: extractedFacts?.committed_capital_mm || null,
      called_capital_mm: extractedFacts?.called_capital_mm || null,
      unfunded_capital_mm: null,
      team_founding_year: null,
      gp_team_size: extractedFacts?.team_size || null,
      key_personnel: extractedFacts?.key_personnel || [],
      investment_strategy: extractedFacts?.investment_strategy || null,
      target_geographies: extractedFacts?.target_geographies || [],
      target_sectors: extractedFacts?.target_sectors || [],
      avg_ticket_size_mm: null,
      portfolio_concentration_pct: extractedFacts?.portfolio_concentration_pct || null,
      style_drift_flags: extractedFacts?.style_drift_flags || [],
      deployment_pace_concern: extractedFacts?.deployment_pace_concern || null,
      concentration_risks: extractedFacts?.concentration_risks || [],
      operational_dd_notes: null,
      confidence_score: 0.85,
      extraction_source: docId,
      fact_type: 'from_document',
      raw_extraction: extractedFacts,
    }

    const { data: factsData, error: factsError } = await saveFacts(factsRecord)

    if (factsError) {
      console.error('Facts insertion error:', factsError)
      // Non-fatal — doc still uploaded successfully
    }

    // 7. Update manager profile with extracted info (if new)
    if (extractedFacts?.fund_name && extractedFacts?.manager_name) {
      await saveManager({
        id: managerId,
        fund_name: extractedFacts.fund_name,
        manager_name: extractedFacts.manager_name,
        asset_class: extractedFacts.asset_class,
        vintage_year: extractedFacts.vintage_year,
        fund_size_mm: extractedFacts.fund_size_mm,
        target_irr: extractedFacts.target_irr,
        management_fee_pct: extractedFacts.management_fee_pct,
        carry_pct: extractedFacts.carry_pct,
        gp_commitment_pct: extractedFacts.gp_commitment_pct,
        team_size: extractedFacts.team_size,
        strategy_description: extractedFacts.investment_strategy,
        geography: extractedFacts.target_geographies,
        sector_focus: extractedFacts.target_sectors,
      })
    }

    return NextResponse.json({
      success: true,
      docId,
      factsId: factsData?.id,
      extractedFacts,
      message: 'Document uploaded and extracted successfully'
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

// app/api/alt/market-research/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { extractDocumentText, cleanTextForExtraction } from '@/lib/doc-processors'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const docType = formData.get('docType') as string
    const source = formData.get('source') as string
    const docDate = formData.get('docDate') as string
    const assetClasses = JSON.parse(formData.get('assetClasses') as string || '["All"]')

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Extract text
    let extractedText = ''
    try {
      const { text } = await extractDocumentText(await file.arrayBuffer(), file.name)
      extractedText = cleanTextForExtraction(text).substring(0, 80000)
    } catch (e) {
      return NextResponse.json({ error: `Text extraction failed: ${(e as Error).message}` }, { status: 500 })
    }

    // AI extraction of key metrics and summary
    const prompt = `You are analyzing a market research document for an alternative investments team.

Extract key benchmarks and metrics. Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of key findings",
  "key_metrics": {
    "metric_name": "value",
    ... up to 8 most important metrics
  },
  "asset_classes_covered": ["list of asset classes mentioned"],
  "time_period": "time period covered",
  "data_provider": "source/publisher if identifiable"
}

Focus on: benchmark returns, quartile thresholds, market statistics, fee benchmarks, allocation trends.

Document:
---
${extractedText.substring(0, 40000)}
---

Return ONLY valid JSON.`

    let extracted: any = {}
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      try { extracted = JSON.parse(text) }
      catch { const m = text.match(/\{[\s\S]*\}/); if (m) extracted = JSON.parse(m[0]) }
    } catch (e) { console.error('AI extraction error:', e) }

    // Save to database
    const { data, error } = await supabase.from('alt_market_research').insert({
      doc_name: file.name,
      source: source || extracted.data_provider || null,
      doc_date: docDate || null,
      asset_class_relevance: assetClasses,
      doc_type: docType,
      file_size_kb: Math.round(file.size / 1024),
      status: 'extracted',
      extracted_text: extractedText,
      key_metrics: extracted.key_metrics || {},
      summary: extracted.summary || null,
    }).select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, doc: data?.[0], extracted })
  } catch (err) {
    console.error('Market research upload error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

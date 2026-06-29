// app/api/alt/score-stage2/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { STAGE2_CONFIG, ASSET_CLASS_TO_STRATEGY } from '@/lib/alt-scoring'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(request: NextRequest) {
  try {
    const { managerId, assetClass } = await request.json()
    const strategy = ASSET_CLASS_TO_STRATEGY[assetClass] || 'Buyout'
    const config = STAGE2_CONFIG[strategy]

    if (!config) return NextResponse.json({ error: `No Stage 2 config for: ${strategy}` }, { status: 400 })

    const { data: facts } = await supabase.from('alt_facts').select('*').eq('manager_id', managerId).limit(1).single()
    const { data: docs } = await supabase.from('alt_docs').select('doc_name, doc_type, extracted_text').eq('manager_id', managerId).eq('status', 'extracted')

    let context = ''
    if (facts) {
      context += `FUND DATA:\n`
      if (facts.fund_size_mm) context += `Fund Size: $${facts.fund_size_mm}M\n`
      if (facts.irr_net) context += `Net IRR: ${(facts.irr_net * 100).toFixed(1)}%\n`
      if (facts.irr_gross) context += `Gross IRR: ${(facts.irr_gross * 100).toFixed(1)}%\n`
      if (facts.tvpi) context += `TVPI: ${facts.tvpi}x\n`
      if (facts.dpi) context += `DPI: ${facts.dpi}x\n`
      if (facts.moic) context += `MOIC: ${facts.moic}x\n`
      if (facts.management_fee_pct) context += `Mgmt Fee: ${(facts.management_fee_pct * 100).toFixed(2)}%\n`
      if (facts.carry_pct) context += `Carry: ${(facts.carry_pct * 100).toFixed(0)}%\n`
      if (facts.gp_commitment_pct) context += `GP Commit: ${(facts.gp_commitment_pct * 100).toFixed(1)}%\n`
      if (facts.investment_strategy) context += `Strategy: ${facts.investment_strategy}\n`
      if (facts.key_personnel?.length) context += `Key Personnel: ${facts.key_personnel.join(', ')}\n`
      if (facts.style_drift_flags?.length) context += `Style Drift: ${facts.style_drift_flags.join('; ')}\n`
      if (facts.concentration_risks?.length) context += `Risks: ${facts.concentration_risks.join('; ')}\n`
    }
    if (docs?.length) {
      docs.forEach((d: any) => {
        if (d.extracted_text) context += `\nDOC: ${d.doc_name}\n${d.extracted_text.substring(0, 15000)}\n`
      })
    }

    // Build criteria list across all sections
    const allCriteria: any[] = []
    for (const [sectionId, section] of Object.entries(config.sections) as any) {
      for (const c of section.criteria) {
        allCriteria.push({ ...c, section: sectionId })
      }
    }

    const criteriaList = allCriteria.map(c => `- "${c.id}" [${c.section}]: ${c.label}\n  Guidance: ${c.guidance || c.what_to_look_for || ''}`).join('\n')
    const flagsList = (config.flags || []).map((f: any) => `- "${f.id}": ${f.label} — ${f.description}`).join('\n')

    const prompt = `You are a senior alternative investment analyst conducting a Stage 2 full underwriting evaluation of a ${strategy} manager.

SCORING SCALE: 5=Exceptional(top decile) | 4=Above Average(top quartile) | 3=Meets Standard(median) | 2=Below Average | 1=Deficient | null=insufficient data

CONFIDENCE LEVELS: H=High confidence data available | M=Partial data, some estimation | L=Limited data, significant uncertainty

CRITERIA TO SCORE:
${criteriaList}

RED FLAGS:
${flagsList}

FUND DATA:
${context}

Return ONLY valid JSON:
{
  "criteriaScores": { ${allCriteria.map(c => `"${c.id}": <1-5 or null>`).join(', ')} },
  "confidence": { ${allCriteria.map(c => `"${c.id}": <"H","M","L" or null>`).join(', ')} },
  "flags": { ${(config.flags || []).map((f: any) => `"${f.id}": <true or false>`).join(', ')} },
  "flagReasons": { ${(config.flags || []).map((f: any) => `"${f.id}": <reason or null>`).join(', ')} }
}

Be rigorous. Flag confidence as L or null when data is missing. Only score 4-5 with clear evidence.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    let result: any = {}
    try { result = JSON.parse(text) }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) result = JSON.parse(m[0]) }

    return NextResponse.json({
      criteriaScores: result.criteriaScores || {},
      confidence: result.confidence || {},
      flags: result.flags || {},
      flagReasons: result.flagReasons || {},
      usage: response.usage,
    })
  } catch (err) {
    console.error('Stage 2 scoring error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

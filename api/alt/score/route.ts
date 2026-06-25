// app/api/alt/score/route.ts
// AI auto-scores fund criteria based on uploaded documents

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { ALT_SCORING_CONFIG } from '@/lib/alt-scoring'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { managerId, assetClass } = await request.json()

    if (!managerId || !assetClass) {
      return NextResponse.json({ error: 'managerId and assetClass required' }, { status: 400 })
    }

    const config = ALT_SCORING_CONFIG[assetClass]
    if (!config) {
      return NextResponse.json({ error: `No scoring config for asset class: ${assetClass}` }, { status: 400 })
    }

    // Load facts and documents for this manager
    const { data: facts } = await supabase
      .from('alt_facts')
      .select('*')
      .eq('manager_id', managerId)
      .limit(1)
      .single()

    const { data: docs } = await supabase
      .from('alt_docs')
      .select('doc_name, doc_type, extracted_text')
      .eq('manager_id', managerId)
      .eq('status', 'extracted')

    // Build context from facts + doc text
    let context = ''

    if (facts) {
      context += `\nEXTRACTED FUND DATA:\n`
      context += `Fund Size: $${facts.fund_size_mm}M\n`
      if (facts.irr_net) context += `Net IRR: ${(facts.irr_net * 100).toFixed(1)}%\n`
      if (facts.irr_gross) context += `Gross IRR: ${(facts.irr_gross * 100).toFixed(1)}%\n`
      if (facts.tvpi) context += `TVPI: ${facts.tvpi}x\n`
      if (facts.dpi) context += `DPI: ${facts.dpi}x\n`
      if (facts.moic) context += `MOIC: ${facts.moic}x\n`
      if (facts.management_fee_pct) context += `Management Fee: ${(facts.management_fee_pct * 100).toFixed(2)}%\n`
      if (facts.carry_pct) context += `Carry: ${(facts.carry_pct * 100).toFixed(0)}%\n`
      if (facts.gp_commitment_pct) context += `GP Commitment: ${(facts.gp_commitment_pct * 100).toFixed(1)}%\n`
      if (facts.investment_strategy) context += `Strategy: ${facts.investment_strategy}\n`
      if (facts.target_geographies?.length) context += `Geographies: ${facts.target_geographies.join(', ')}\n`
      if (facts.key_personnel?.length) context += `Key Personnel: ${facts.key_personnel.join(', ')}\n`
      if (facts.style_drift_flags?.length) context += `Style Drift Flags: ${facts.style_drift_flags.join('; ')}\n`
      if (facts.concentration_risks?.length) context += `Concentration Risks: ${facts.concentration_risks.join('; ')}\n`
    }

    if (docs?.length) {
      docs.forEach((doc: any) => {
        if (doc.extracted_text) {
          context += `\n\nDOCUMENT: ${doc.doc_name} (${doc.doc_type})\n`
          context += doc.extracted_text.substring(0, 20000)
        }
      })
    }

    // Build criteria list for prompt
    const criteriaList = config.criteria.map(c =>
      `- "${c.id}": ${c.label}\n  What to look for: ${c.what_to_look_for}`
    ).join('\n')

    const prompt = `You are an expert alternative investment analyst at Storgate, scoring a ${assetClass} fund manager.

Score each criterion on a 1-5 scale:
5 = Exceptional (top decile vs peers)
4 = Above Average (top quartile)
3 = Meets Standard (median peer)
2 = Below Average (below median)
1 = Deficient (bottom quartile, material concern)

CRITERIA TO SCORE:
${criteriaList}

FUND DATA AND DOCUMENTS:
${context}

Return ONLY valid JSON with scores for each criterion ID. Use null if insufficient data:
{
${config.criteria.map(c => `  "${c.id}": <1-5 or null>`).join(',\n')}
}

Be rigorous. Only score 4-5 if there is clear evidence of outperformance. Score null if you cannot find enough information to assess.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    let scores: Record<string, number | null> = {}
    try {
      scores = JSON.parse(responseText)
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) scores = JSON.parse(match[0])
      else throw new Error('Could not parse scoring response')
    }

    return NextResponse.json({ scores, usage: response.usage })

  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

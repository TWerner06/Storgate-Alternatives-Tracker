// app/api/alt/score/route.ts
// AI auto-scores fund criteria and auto-flags red flags based on uploaded documents

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { STAGE1_CONFIG } from '@/lib/alt-scoring'

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

    const config = STAGE1_CONFIG[assetClass]
    if (!config) {
      return NextResponse.json({ error: `No scoring config for: ${assetClass}` }, { status: 400 })
    }

    // Load ALL facts rows for this manager (not just one) — each uploaded document
    // creates its own facts row, so limiting to one row was silently dropping data
    // from every document after the first one uploaded for this fund.
    const { data: allFacts } = await supabase
      .from('alt_facts')
      .select('*')
      .eq('manager_id', managerId)
      .order('created_at', { ascending: true })

    const { data: docs } = await supabase
      .from('alt_docs')
      .select('doc_name, doc_type, extracted_text')
      .eq('manager_id', managerId)
      .eq('status', 'extracted')

    // Build context — merge all facts rows so nothing from later document uploads
    // gets silently dropped. Later rows can supplement (not overwrite) earlier data.
    let context = ''
    if (allFacts?.length) {
      context += `\nEXTRACTED FUND DATA (merged from ${allFacts.length} document${allFacts.length > 1 ? 's' : ''}):\n`
      const merged: Record<string, any> = {}
      for (const facts of allFacts) {
        for (const [key, val] of Object.entries(facts)) {
          if (val == null) continue
          if (Array.isArray(val) && val.length === 0) continue
          if (merged[key] == null) merged[key] = val
          else if (Array.isArray(merged[key]) && Array.isArray(val)) {
            merged[key] = [...new Set([...merged[key], ...val])]
          }
        }
      }
      if (merged.fund_size_mm) context += `Fund Size: $${merged.fund_size_mm}M\n`
      if (merged.irr_net) context += `Net IRR: ${(merged.irr_net * 100).toFixed(1)}%\n`
      if (merged.irr_gross) context += `Gross IRR: ${(merged.irr_gross * 100).toFixed(1)}%\n`
      if (merged.tvpi) context += `TVPI: ${merged.tvpi}x\n`
      if (merged.dpi) context += `DPI: ${merged.dpi}x\n`
      if (merged.moic) context += `MOIC: ${merged.moic}x\n`
      if (merged.management_fee_pct) context += `Management Fee: ${(merged.management_fee_pct * 100).toFixed(2)}%\n`
      if (merged.carry_pct) context += `Carry: ${(merged.carry_pct * 100).toFixed(0)}%\n`
      if (merged.gp_commitment_pct) context += `GP Commitment: ${(merged.gp_commitment_pct * 100).toFixed(1)}%\n`
      if (merged.investment_strategy) context += `Strategy: ${merged.investment_strategy}\n`
      if (merged.target_geographies?.length) context += `Geographies: ${merged.target_geographies.join(', ')}\n`
      if (merged.key_personnel?.length) context += `Key Personnel: ${merged.key_personnel.join(', ')}\n`
      if (merged.style_drift_flags?.length) context += `Style Drift Flags: ${merged.style_drift_flags.join('; ')}\n`
      if (merged.concentration_risks?.length) context += `Concentration Risks: ${merged.concentration_risks.join('; ')}\n`
      if (merged.deployment_pace_concern) context += `Deployment Pace Concern: ${merged.deployment_pace_concern}\n`
    }

    if (docs?.length) {
      docs.forEach((doc: any) => {
        if (doc.extracted_text) {
          context += `\n\nDOCUMENT: ${doc.doc_name} (${doc.doc_type})\n`
          context += doc.extracted_text.substring(0, 20000)
        }
      })
    }

    const criteriaList = config.criteria.map(c =>
      `- "${c.id}": ${c.label}\n  What to look for: ${c.what_to_look_for}`
    ).join('\n')

    const flagsList = config.flags.map(f =>
      `- "${f.id}": ${f.label}`
    ).join('\n')

    const prompt = `You are an expert alternative investment analyst at Storgate, scoring a ${assetClass} fund manager.

SCORING SCALE:
5 = Exceptional (top decile vs peers)
4 = Above Average (top quartile)
3 = Meets Standard (median peer)
2 = Below Average (below median)
1 = Deficient (bottom quartile, material concern)
null = insufficient data to assess

For each criterion, also return a confidence level. BE CALIBRATED, NOT CONSERVATIVE — if the documents give you
specific, concrete evidence to assess a criterion, mark it H even if the evidence isn't perfectly exhaustive.
Reserve M and L for genuine gaps, not for ordinary real-world data that simply requires synthesis or judgment.

H (High) = The documents contain specific, concrete evidence relevant to this criterion — named numbers, named
  people, explicit policies, or clear qualitative statements you can point to. This should be your DEFAULT when
  the documents discuss the topic at all with specifics. Example: if the doc states "Permian Basin accounts for
  ~65% of deal flow" and the criterion is about concentration risk, that is H — you have a concrete, citable fact.
M (Medium) = The documents touch on the topic but only partially, vaguely, or you had to infer/calculate from
  adjacent data rather than a direct statement.
L (Low) = The documents say essentially nothing relevant to this criterion — you are guessing or relying entirely
  on general industry assumptions with no fund-specific evidence at all.

Do not default to M out of caution. A specific number, named policy, or clearly stated fact in the source
documents — even if it's just one data point — earns H. Only use L when the source documents are genuinely
silent on the topic.

CRITERIA TO SCORE:
${criteriaList}

RED FLAGS TO CHECK (return true if the flag applies based on evidence in the documents):
${flagsList}

FUND DATA AND DOCUMENTS:
${context}

Return ONLY valid JSON with this exact structure:
{
  "scores": {
${config.criteria.map(c => `    "${c.id}": <1-5 or null>`).join(',\n')}
  },
  "confidence": {
${config.criteria.map(c => `    "${c.id}": "<H|M|L|null>"`).join(',\n')}
  },
  "flags": {
${config.flags.map(f => `    "${f.id}": <true or false>`).join(',\n')}
  },
  "flag_reasons": {
${config.flags.map(f => `    "${f.id}": "<brief reason if true, or null>"`).join(',\n')}
  }
}

Be rigorous. Only score 4-5 if there is clear evidence of outperformance. Flag as true only if there is specific evidence in the documents supporting the flag.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    let result: { scores: Record<string, number | null>; confidence: Record<string, 'H' | 'M' | 'L' | null>; flags: Record<string, boolean>; flag_reasons: Record<string, string | null> } = {
      scores: {}, confidence: {}, flags: {}, flag_reasons: {}
    }

    try {
      result = JSON.parse(responseText)
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) result = JSON.parse(match[0])
      else throw new Error('Could not parse scoring response')
    }

    return NextResponse.json({
      scores: result.scores || {},
      confidence: result.confidence || {},
      flags: result.flags || {},
      flag_reasons: result.flag_reasons || {},
      usage: response.usage
    })

  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

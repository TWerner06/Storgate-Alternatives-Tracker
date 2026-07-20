// app/api/alt/score/route.ts
// AI auto-scores fund criteria and auto-flags red flags based on uploaded documents.
//
// Improvements over prior version:
//   - Per-document text increased from 20K → 40K chars for richer scoring context
//   - Stronger null guidance: AI must cite a specific piece of evidence or return null
//   - Score rationale field added per criterion so scores are auditable
//   - Data inventory pre-check: AI lists what it found before scoring

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

    // Load ALL facts rows for this manager — each uploaded document creates its own
    // facts row, so merging all of them ensures nothing from later uploads is dropped.
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

    // Build context — merge all facts rows
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

      if (merged.fund_size_mm)        context += `Fund Size: $${merged.fund_size_mm}M\n`
      if (merged.irr_net)             context += `Net IRR: ${(merged.irr_net * 100).toFixed(1)}%\n`
      if (merged.irr_gross)           context += `Gross IRR: ${(merged.irr_gross * 100).toFixed(1)}%\n`
      if (merged.target_irr)          context += `Target IRR: ${(merged.target_irr * 100).toFixed(1)}%\n`
      if (merged.tvpi)                context += `TVPI: ${merged.tvpi}x\n`
      if (merged.dpi)                 context += `DPI: ${merged.dpi}x\n`
      if (merged.moic)                context += `MOIC: ${merged.moic}x\n`
      if (merged.management_fee_pct)  context += `Management Fee: ${(merged.management_fee_pct * 100).toFixed(2)}%\n`
      if (merged.carry_pct)           context += `Carry: ${(merged.carry_pct * 100).toFixed(0)}%\n`
      if (merged.hurdle_rate)         context += `Hurdle Rate: ${(merged.hurdle_rate * 100).toFixed(1)}%\n`
      if (merged.gp_commitment_pct)   context += `GP Commitment: ${(merged.gp_commitment_pct * 100).toFixed(1)}%\n`
      if (merged.lock_up_months)      context += `Lock-up: ${merged.lock_up_months} months\n`
      if (merged.vintage_year)        context += `Vintage Year: ${merged.vintage_year}\n`
      if (merged.investment_strategy) context += `Strategy: ${merged.investment_strategy}\n`
      if (merged.target_geographies?.length)  context += `Geographies: ${merged.target_geographies.join(', ')}\n`
      if (merged.target_sectors?.length)      context += `Sectors: ${merged.target_sectors.join(', ')}\n`
      if (merged.key_personnel?.length)       context += `Key Personnel: ${merged.key_personnel.join(', ')}\n`
      if (merged.gp_team_size)        context += `Team Size: ${merged.gp_team_size}\n`
      if (merged.style_drift_flags?.length)   context += `Style Drift Flags: ${merged.style_drift_flags.join('; ')}\n`
      if (merged.concentration_risks?.length) context += `Concentration Risks: ${merged.concentration_risks.join('; ')}\n`
      if (merged.deployment_pace_concern)     context += `Notes: ${merged.deployment_pace_concern}\n`
    }

    // Include raw document text — increased from 20K to 40K chars per doc for
    // richer context, especially for longer PPMs where key terms are near the end.
    if (docs?.length) {
      docs.forEach((doc: any) => {
        if (doc.extracted_text) {
          context += `\n\nDOCUMENT: ${doc.doc_name} (${doc.doc_type})\n`
          context += doc.extracted_text.substring(0, 40000)
        }
      })
    }

    const criteriaList = config.criteria.map(c =>
      `- "${c.id}": ${c.label}\n  What to look for: ${c.what_to_look_for}`
    ).join('\n')

    const flagsList = config.flags.map(f =>
      `- "${f.id}": ${f.label} — ${f.description}`
    ).join('\n')

    const prompt = `You are an expert alternative investment analyst at Storgate, scoring a ${assetClass} fund.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL NULL RULE — READ THIS FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each criterion, ask yourself: "Can I cite a specific sentence, number, or statement from these documents that directly relates to this criterion?"

If YES → score it (1–5) and cite that evidence in the rationale.
If NO  → return null. Do not estimate, infer, or assign a 2–3 as a placeholder.

null is not a failure — it means the documents don't address this criterion. A fund with 4 scored criteria and 3 nulls is BETTER than one with 7 guesses.

NEVER assign a score based solely on:
- General industry assumptions ("most energy funds hedge")
- The fund's asset class alone
- What you'd "expect" without document evidence
- Absence of negative information

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING SCALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 = Exceptional (top decile vs peers) — requires specific evidence of outperformance
4 = Above Average (top quartile) — requires concrete positive evidence
3 = Meets Standard (median peer) — requires evidence they address this criterion adequately
2 = Below Average — requires specific evidence of underperformance or concern
1 = Deficient — requires specific evidence of material failure
null = No usable evidence in documents — DO NOT GUESS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE CALIBRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H (High): Document contains specific, named, concrete evidence — a number, named policy, explicit statement you can quote. THIS IS YOUR DEFAULT when documents discuss the topic with specifics.
M (Medium): Document touches the topic but only partially, vaguely, or requires inference from adjacent data.
L (Low): Only one weak data point, significant ambiguity about applicability, or you had to synthesize across many sources with uncertainty.
null: Return alongside a null score.

Do NOT default to M out of caution. One clear cited fact = H.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITERIA TO SCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${criteriaList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RED FLAGS (return true only with specific document evidence)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${flagsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUND DATA AND DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON with this exact structure:
{
  "data_inventory": "1–2 sentences summarizing what quantitative and qualitative data you found in the documents — be specific about what is and isn't present",
  "scores": {
${config.criteria.map(c => `    "${c.id}": <1-5 or null>`).join(',\n')}
  },
  "rationales": {
${config.criteria.map(c => `    "${c.id}": "<one sentence citing the specific evidence used, or 'No evidence found' if null>"`).join(',\n')}
  },
  "confidence": {
${config.criteria.map(c => `    "${c.id}": "<H|M|L|null>"`).join(',\n')}
  },
  "flags": {
${config.flags.map(f => `    "${f.id}": <true or false>`).join(',\n')}
  },
  "flag_reasons": {
${config.flags.map(f => `    "${f.id}": "<specific evidence if true, or null>"`).join(',\n')}
  }
}

Remember: null scores are correct and honest. Do not fill in guesses.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    let result: {
      data_inventory?: string
      scores: Record<string, number | null>
      rationales?: Record<string, string | null>
      confidence: Record<string, 'H' | 'M' | 'L' | null>
      flags: Record<string, boolean>
      flag_reasons: Record<string, string | null>
    } = {
      scores: {}, rationales: {}, confidence: {}, flags: {}, flag_reasons: {}
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
      rationales: result.rationales || {},
      confidence: result.confidence || {},
      flags: result.flags || {},
      flag_reasons: result.flag_reasons || {},
      data_inventory: result.data_inventory || null,
      usage: response.usage,
    })

  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

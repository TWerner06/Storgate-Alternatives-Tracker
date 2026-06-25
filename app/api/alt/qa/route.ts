// app/api/alt/qa/route.ts
// AI assistant for asking questions about alternative investments

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request: Request) {
  try {
    const { question, history, managerId, managerIds, context } = await request.json()

    if (!question) {
      return Response.json({ error: 'question required' }, { status: 400 })
    }

    // Fetch manager facts for context
    let managerContext = ''
    const idsToFetch = managerIds || (managerId ? [managerId] : [])

    if (idsToFetch.length > 0) {
      const { data: facts } = await supabase
        .from('alt_facts')
        .select('*')
        .in('manager_id', idsToFetch)

      if (facts?.length) {
        managerContext = '\n\nFUND DATA:\n'
        facts.forEach(fact => {
          managerContext += `
Manager ID: ${fact.manager_id}
Fund Size: $${fact.fund_size_mm}M
IRR (Net): ${fact.irr_net ? (fact.irr_net * 100).toFixed(1) + '%' : 'N/A'}
TVPI: ${fact.tvpi?.toFixed(2) || 'N/A'}
DPI: ${fact.dpi?.toFixed(2) || 'N/A'}
Management Fee: ${fact.management_fee_pct?.toFixed(2) + '%' || 'N/A'}
GP Commitment: ${fact.gp_commitment_pct?.toFixed(1) + '%' || 'N/A'}
Lock-up: ${fact.lock_up_months} months
Strategy: ${fact.investment_strategy || 'N/A'}
Geographies: ${fact.target_geographies?.join(', ') || 'N/A'}
Sectors: ${fact.target_sectors?.join(', ') || 'N/A'}
Portfolio Concentration: ${fact.portfolio_concentration_pct?.toFixed(1) + '%' || 'N/A'}
Risks/Concerns: ${fact.concentration_risks?.join('; ') || 'None noted'}
---
`
        })
      }
    }

    // Fetch any notes associated with the managers
    let notesContext = ''
    if (idsToFetch.length > 0) {
      const { data: notes } = await supabase
        .from('alt_notes')
        .select('*')
        .in('manager_id', idsToFetch)

      if (notes?.length) {
        notesContext = '\n\nQUALITATIVE NOTES:\n'
        const byType = {}
        notes.forEach(note => {
          if (!byType[note.note_type]) byType[note.note_type] = []
          byType[note.note_type].push(note.content)
        })
        Object.entries(byType).forEach(([type, contents]) => {
          notesContext += `\n${type.toUpperCase()}:\n`
          ;(contents as string[]).forEach(c => {
            notesContext += `- ${c}\n`
          })
        })
      }
    }

    const systemPrompt = `You are an expert analyst specializing in alternative investments (private equity, private credit, hedge funds, real assets, infrastructure).

You have access to extracted data from fund documents including PPMs, audited financials, quarterly letters, and due diligence questionnaires.

When answering questions:
- Be specific with numbers and metrics when available
- Flag any concerns or red flags noted in the data
- Distinguish between quantitative metrics and qualitative assessments
- If data is incomplete, note what information is missing
- Provide balanced perspective on strengths and weaknesses
- Use professional investment language${managerContext}${notesContext}`

    const messages = (history || []).map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    messages.push({
      role: 'user',
      content: question
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages as any
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const usage = response.usage

    return Response.json({
      text,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens
      }
    })
  } catch (err) {
    console.error('QA route error:', err)
    return Response.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}

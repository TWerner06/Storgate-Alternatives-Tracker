// app/api/alt/qa/route.ts
// AI assistant with preference memory — learns from your notes and decisions over time

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { question, history, managerId, sessionId } = await request.json()

    if (!question) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }

    // Load all fund data if managerId provided
    let fundContext = ''
    if (managerId) {
      const { data: manager } = await supabase
        .from('alt_managers')
        .select('*')
        .eq('id', managerId)
        .single()

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

      const { data: notes } = await supabase
        .from('alt_notes')
        .select('*')
        .eq('manager_id', managerId)

      if (manager) {
        fundContext += `\n\nCURRENT FUND: ${manager.fund_name} (${manager.asset_class})\n`
        fundContext += `Manager: ${manager.manager_name}\n`
        fundContext += `Pipeline Status: ${manager.pipeline_status}\n`
      }

      if (facts) {
        fundContext += `\nEXTRACTED FACTS:\n`
        if (facts.fund_size_mm) fundContext += `Fund Size: $${facts.fund_size_mm}M\n`
        if (facts.irr_net) fundContext += `Net IRR: ${(facts.irr_net * 100).toFixed(1)}%\n`
        if (facts.irr_gross) fundContext += `Gross IRR: ${(facts.irr_gross * 100).toFixed(1)}%\n`
        if (facts.tvpi) fundContext += `TVPI: ${facts.tvpi}x\n`
        if (facts.dpi) fundContext += `DPI: ${facts.dpi}x\n`
        if (facts.moic) fundContext += `MOIC: ${facts.moic}x\n`
        if (facts.management_fee_pct) fundContext += `Management Fee: ${(facts.management_fee_pct * 100).toFixed(2)}%\n`
        if (facts.carry_pct) fundContext += `Carry: ${(facts.carry_pct * 100).toFixed(0)}%\n`
        if (facts.gp_commitment_pct) fundContext += `GP Commitment: ${(facts.gp_commitment_pct * 100).toFixed(1)}%\n`
        if (facts.hurdle_rate) fundContext += `Hurdle Rate: ${(facts.hurdle_rate * 100).toFixed(1)}%\n`
        if (facts.lock_up_months) fundContext += `Lock-up: ${facts.lock_up_months} months\n`
        if (facts.investment_strategy) fundContext += `Strategy: ${facts.investment_strategy}\n`
        if (facts.target_geographies?.length) fundContext += `Geographies: ${facts.target_geographies.join(', ')}\n`
        if (facts.target_sectors?.length) fundContext += `Sectors: ${facts.target_sectors.join(', ')}\n`
        if (facts.key_personnel?.length) fundContext += `Key Personnel: ${facts.key_personnel.join(', ')}\n`
        if (facts.style_drift_flags?.length) fundContext += `Style Drift Flags: ${facts.style_drift_flags.join('; ')}\n`
        if (facts.concentration_risks?.length) fundContext += `Concentration Risks: ${facts.concentration_risks.join('; ')}\n`
      }

      if (docs?.length) {
        docs.forEach((doc: any) => {
          if (doc.extracted_text) {
            fundContext += `\n\nDOCUMENT: ${doc.doc_name} (${doc.doc_type})\n`
            fundContext += doc.extracted_text.substring(0, 15000)
          }
        })
      }

      if (notes?.length) {
        fundContext += `\n\nTEAM NOTES:\n`
        notes.forEach((note: any) => {
          fundContext += `[${note.note_type}] ${note.content}\n`
        })
      }
    }

    // Load preference memory — all notes and decisions across ALL funds
    const { data: allNotes } = await supabase
      .from('alt_notes')
      .select('content, note_type, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: allManagers } = await supabase
      .from('alt_managers')
      .select('fund_name, asset_class, pipeline_status, management_fee_pct, carry_pct')
      .order('created_at', { ascending: false })
      .limit(20)

    let preferenceContext = ''
    if (allNotes?.length || allManagers?.length) {
      preferenceContext += '\n\nSTORGATE INVESTMENT PREFERENCES & HISTORY:\n'

      // Pipeline decisions
      if (allManagers?.length) {
        const passed = allManagers.filter(m => m.pipeline_status === 'pass')
        const investing = allManagers.filter(m => m.pipeline_status === 'investing')
        const tracking = allManagers.filter(m => m.pipeline_status === 'tracking')

        if (investing.length) preferenceContext += `Funds we are investing in: ${investing.map(m => m.fund_name).join(', ')}\n`
        if (passed.length) preferenceContext += `Funds we have passed on: ${passed.map(m => m.fund_name).join(', ')}\n`
        if (tracking.length) preferenceContext += `Funds we are tracking: ${tracking.map(m => m.fund_name).join(', ')}\n`
      }

      // Team notes as preference signals
      if (allNotes?.length) {
        preferenceContext += '\nTeam notes and observations:\n'
        allNotes.slice(0, 20).forEach(note => {
          preferenceContext += `- ${note.content}\n`
        })
      }
    }

    const systemPrompt = `You are an expert alternative investment analyst embedded at Storgate, a family office and investment advisory firm.

You have deep expertise in private equity, private credit, hedge funds, managed futures, real assets, energy, crypto, and opportunistic investing. You can answer questions about any investment topic — market conditions, fund structures, benchmarks, deal terms, historical performance, macro trends, or anything else.

When you have specific fund data available, you use it to give precise, data-driven answers. When you don't, you draw on your broad investment knowledge.

GUIDELINES:
- Be direct and concise — this is a professional investment team
- Lead with the most important point
- Use specific numbers when available
- Flag concerns proactively — don't sugarcoat
- When comparing funds or benchmarks, be specific about the comparison
- If you notice something that warrants attention, say so
- Learn from the team's past decisions and notes to calibrate your perspective${fundContext}${preferenceContext}`

    const messages = [
      ...(history || []).map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: question }
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Save conversation
    if (sessionId) {
      const updatedHistory = [
        ...(history || []),
        { role: 'user', content: question },
        { role: 'assistant', content: text },
      ]

      await supabase
        .from('alt_conversations')
        .upsert({
          session_id: sessionId,
          manager_id: managerId || null,
          messages: updatedHistory,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id' })
    }

    return NextResponse.json({
      text,
      usage: response.usage,
    })

  } catch (err) {
    console.error('QA error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

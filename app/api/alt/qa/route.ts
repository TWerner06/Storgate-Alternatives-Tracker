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

    // Load ALL funds data for global AI context
    const { data: allManagers } = await supabase
      .from('alt_managers')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: allFacts } = await supabase
      .from('alt_facts')
      .select('*')

    const { data: allNotes } = await supabase
      .from('alt_notes')
      .select('content, note_type, created_at, manager_id')
      .order('created_at', { ascending: false })
      .limit(50)

    // Load full document text for specific fund if mentioned, or all funds
    let fundContext = ''
    if (managerId) {
      const { data: docs } = await supabase
        .from('alt_docs')
        .select('doc_name, doc_type, extracted_text')
        .eq('manager_id', managerId)
        .eq('status', 'extracted')

      const { data: manager } = await supabase
        .from('alt_managers')
        .select('*')
        .eq('id', managerId)
        .single()

      const facts = allFacts?.find(f => f.manager_id === managerId)
      const notes = allNotes?.filter(n => n.manager_id === managerId)

      if (manager) {
        fundContext += `\n\nFOCUS FUND: ${manager.fund_name} (${manager.asset_class})\n`
        fundContext += `Pipeline Status: ${manager.pipeline_status}\n`
      }
      if (facts) {
        fundContext += `Fund Size: $${facts.fund_size_mm}M | IRR: ${facts.irr_net ? (facts.irr_net * 100).toFixed(1) + '%' : 'N/A'} | TVPI: ${facts.tvpi || 'N/A'}x | Fee: ${facts.management_fee_pct ? (facts.management_fee_pct * 100).toFixed(2) + '%' : 'N/A'}\n`
        if (facts.investment_strategy) fundContext += `Strategy: ${facts.investment_strategy}\n`
      }
      if (notes?.length) {
        fundContext += `Team Notes: ${notes.map((n: any) => n.content).join(' | ')}\n`
      }
      if (docs?.length) {
        docs.forEach((doc: any) => {
          if (doc.extracted_text) {
            fundContext += `\nFULL DOCUMENT: ${doc.doc_name} (${doc.doc_type})\n${doc.extracted_text.substring(0, 30000)}\n`
          }
        })
      }
    }

    // Build portfolio summary for global context
    let portfolioContext = '\n\nPORTFOLIO OVERVIEW:\n'
    if (allManagers?.length) {
      allManagers.forEach(m => {
        const facts = allFacts?.find(f => f.manager_id === m.id)
        const notes = allNotes?.filter(n => n.manager_id === m.id)
        portfolioContext += `\n${m.fund_name} (${m.asset_class}) — Status: ${m.pipeline_status}\n`
        if (facts) {
          portfolioContext += `  Fund Size: $${facts.fund_size_mm}M | Fee: ${facts.management_fee_pct ? (facts.management_fee_pct * 100).toFixed(2) + '%' : 'N/A'} | Carry: ${facts.carry_pct ? (facts.carry_pct * 100).toFixed(0) + '%' : 'N/A'} | MOIC: ${facts.moic || 'N/A'}x\n`
          if (facts.investment_strategy) portfolioContext += `  Strategy: ${facts.investment_strategy}\n`
          if (facts.style_drift_flags?.length) portfolioContext += `  ⚠️ Flags: ${facts.style_drift_flags.join('; ')}\n`
        }
        if (notes?.length) {
          portfolioContext += `  Team Notes: ${notes.map((n: any) => n.content).join(' | ')}\n`
        }
      })
    } else {
      portfolioContext += 'No funds in portfolio yet.\n'
    }

    let preferenceContext = ''
    if (allNotes?.length) {
      const passed = allManagers?.filter(m => m.pipeline_status === 'pass') || []
      const investing = allManagers?.filter(m => m.pipeline_status === 'investing') || []
      if (investing.length || passed.length) {
        preferenceContext += '\n\nINVESTMENT DECISIONS:\n'
        if (investing.length) preferenceContext += `Investing in: ${investing.map(m => m.fund_name).join(', ')}\n`
        if (passed.length) preferenceContext += `Passed on: ${passed.map(m => m.fund_name).join(', ')}\n`
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
- Learn from the team's past decisions and notes to calibrate your perspective${fundContext}${portfolioContext}${preferenceContext}`

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

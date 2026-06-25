import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Alt Managers (Fund Registry) ──────────────────────────────────────────

export async function saveManager(manager) {
  const { data, error } = await supabase
    .from('alt_managers')
    .upsert({
      id: manager.id,
      fund_name: manager.fund_name,
      fund_slug: manager.fund_slug,
      manager_name: manager.manager_name,
      asset_class: manager.asset_class,
      vintage_year: manager.vintage_year,
      fund_size_mm: manager.fund_size_mm,
      target_irr: manager.target_irr,
      team_size: manager.team_size,
      gp_commitment_pct: manager.gp_commitment_pct,
      lock_up_months: manager.lock_up_months,
      management_fee_pct: manager.management_fee_pct,
      carry_pct: manager.carry_pct,
      strategy_description: manager.strategy_description,
      geography: manager.geography || [],
      sector_focus: manager.sector_focus || [],
      ticket_size_range: manager.ticket_size_range,
      manager_website: manager.manager_website,
      manager_email: manager.manager_email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fund_name' })
    .select()
  return { data, error }
}

export async function loadManager(managerId) {
  const { data, error } = await supabase
    .from('alt_managers')
    .select('*')
    .eq('id', managerId)
    .single()
  return { data, error }
}

export async function loadManagerByName(fundName) {
  const { data, error } = await supabase
    .from('alt_managers')
    .select('*')
    .eq('fund_name', fundName)
    .single()
  return { data, error }
}

export async function loadManagers(filters = {}) {
  let query = supabase.from('alt_managers').select('*')
  
  if (filters.asset_class) {
    query = query.eq('asset_class', filters.asset_class)
  }
  if (filters.search) {
    query = query.or(`fund_name.ilike.%${filters.search}%,manager_name.ilike.%${filters.search}%`)
  }
  
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data, error }
}

export async function deleteManager(managerId) {
  const { error } = await supabase
    .from('alt_managers')
    .delete()
    .eq('id', managerId)
  return { error }
}

// ── Alt Documents ────────────────────────────────────────────────────────

export async function saveDoc(doc) {
  const { data, error } = await supabase
    .from('alt_docs')
    .insert({
      manager_id: doc.manager_id,
      doc_type: doc.doc_type,
      doc_name: doc.doc_name,
      file_path: doc.file_path,
      file_size_kb: doc.file_size_kb,
      status: doc.status || 'pending',
      page_count: doc.page_count,
      extracted_text: doc.extracted_text,
    })
    .select()
  return { data: data?.[0], error }
}

export async function updateDocStatus(docId, status, extractedText = null, pageCount = null) {
  const update = {
    status,
    extracted_at: status === 'extracted' ? new Date().toISOString() : null,
  }
  if (extractedText) update.extracted_text = extractedText
  if (pageCount) update.page_count = pageCount
  
  const { data, error } = await supabase
    .from('alt_docs')
    .update(update)
    .eq('id', docId)
    .select()
  return { data: data?.[0], error }
}

export async function updateDocError(docId, errorMessage) {
  const { data, error } = await supabase
    .from('alt_docs')
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .eq('id', docId)
    .select()
  return { data: data?.[0], error }
}

export async function loadDocs(managerId) {
  const { data, error } = await supabase
    .from('alt_docs')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function loadDoc(docId) {
  const { data, error } = await supabase
    .from('alt_docs')
    .select('*')
    .eq('id', docId)
    .single()
  return { data, error }
}

export async function deleteDoc(docId) {
  const { error } = await supabase
    .from('alt_docs')
    .delete()
    .eq('id', docId)
  return { error }
}

// ── Alt Facts (Extracted Data) ───────────────────────────────────────────

export async function saveFacts(facts) {
  const { data, error } = await supabase
    .from('alt_facts')
    .insert({
      manager_id: facts.manager_id,
      doc_id: facts.doc_id,
      irr_net: facts.irr_net,
      irr_gross: facts.irr_gross,
      tvpi: facts.tvpi,
      dpi: facts.dpi,
      moic: facts.moic,
      management_fee_pct: facts.management_fee_pct,
      carry_pct: facts.carry_pct,
      hurdle_rate: facts.hurdle_rate,
      lock_up_months: facts.lock_up_months,
      gp_commitment_pct: facts.gp_commitment_pct,
      preferred_return_pct: facts.preferred_return_pct,
      clawback_provision: facts.clawback_provision,
      secondary_sale_rights: facts.secondary_sale_rights,
      fund_size_mm: facts.fund_size_mm,
      committed_capital_mm: facts.committed_capital_mm,
      called_capital_mm: facts.called_capital_mm,
      unfunded_capital_mm: facts.unfunded_capital_mm,
      team_founding_year: facts.team_founding_year,
      gp_team_size: facts.gp_team_size,
      key_personnel: facts.key_personnel || [],
      investment_strategy: facts.investment_strategy,
      target_geographies: facts.target_geographies || [],
      target_sectors: facts.target_sectors || [],
      avg_ticket_size_mm: facts.avg_ticket_size_mm,
      portfolio_concentration_pct: facts.portfolio_concentration_pct,
      style_drift_flags: facts.style_drift_flags || [],
      deployment_pace_concern: facts.deployment_pace_concern,
      concentration_risks: facts.concentration_risks || [],
      operational_dd_notes: facts.operational_dd_notes,
      confidence_score: facts.confidence_score || 0.8,
      extraction_source: facts.extraction_source,
      fact_type: facts.fact_type,
      raw_extraction: facts.raw_extraction,
    })
    .select()
  return { data: data?.[0], error }
}

export async function loadFacts(managerId) {
  const { data, error } = await supabase
    .from('alt_facts')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function loadFactsByDoc(docId) {
  const { data, error } = await supabase
    .from('alt_facts')
    .select('*')
    .eq('doc_id', docId)
    .single()
  return { data, error }
}

export async function deleteFacts(factsId) {
  const { error } = await supabase
    .from('alt_facts')
    .delete()
    .eq('id', factsId)
  return { error }
}

// ── Alt Cashflows ────────────────────────────────────────────────────────

export async function saveCashflow(cashflow) {
  const { data, error } = await supabase
    .from('alt_cashflows')
    .insert({
      manager_id: cashflow.manager_id,
      doc_id: cashflow.doc_id,
      cashflow_type: cashflow.cashflow_type,
      cashflow_date: cashflow.cashflow_date,
      amount_mm: cashflow.amount_mm,
      description: cashflow.description,
      percentage_of_committed: cashflow.percentage_of_committed,
      unfunded_remaining_mm: cashflow.unfunded_remaining_mm,
      nav_at_date_mm: cashflow.nav_at_date_mm,
    })
    .select()
  return { data: data?.[0], error }
}

export async function loadCashflows(managerId) {
  const { data, error } = await supabase
    .from('alt_cashflows')
    .select('*')
    .eq('manager_id', managerId)
    .order('cashflow_date', { ascending: false })
  return { data, error }
}

export async function deleteCashflow(cashflowId) {
  const { error } = await supabase
    .from('alt_cashflows')
    .delete()
    .eq('id', cashflowId)
  return { error }
}

// ── Alt Notes (Qualitative Commentary) ────────────────────────────────────

export async function saveNote(note) {
  const { data, error } = await supabase
    .from('alt_notes')
    .insert({
      manager_id: note.manager_id,
      doc_id: note.doc_id,
      note_type: note.note_type,
      content: note.content,
    })
    .select()
  return { data: data?.[0], error }
}

export async function loadNotes(managerId, noteType = null) {
  let query = supabase
    .from('alt_notes')
    .select('*')
    .eq('manager_id', managerId)
  
  if (noteType) {
    query = query.eq('note_type', noteType)
  }
  
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data, error }
}

export async function updateNote(noteId, content) {
  const { data, error } = await supabase
    .from('alt_notes')
    .update({
      content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select()
  return { data: data?.[0], error }
}

export async function deleteNote(noteId) {
  const { error } = await supabase
    .from('alt_notes')
    .delete()
    .eq('id', noteId)
  return { error }
}

// ── Alt Conversations (AI Assistant History) ─────────────────────────────

export async function saveConversation(sessionId, messages, managerId = null) {
  const { data, error } = await supabase
    .from('alt_conversations')
    .upsert({
      session_id: sessionId,
      manager_id: managerId,
      messages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' })
    .select()
  return { data: data?.[0], error }
}

export async function loadConversations(limit = 20) {
  const { data, error } = await supabase
    .from('alt_conversations')
    .select('session_id, messages, updated_at, manager_id')
    .order('updated_at', { ascending: false })
    .limit(limit)
  
  if (error || !data?.length) return []
  
  return data.map(row => ({
    sessionId: row.session_id,
    messages: row.messages || [],
    lastUpdated: row.updated_at,
    managerId: row.manager_id,
    preview: row.messages?.[0]?.content?.slice(0, 60) || 'Empty conversation',
  }))
}

export async function loadConversation(sessionId) {
  const { data, error } = await supabase
    .from('alt_conversations')
    .select('messages, updated_at, manager_id')
    .eq('session_id', sessionId)
    .single()
  
  if (error || !data) return null
  
  return {
    messages: data.messages || [],
    lastUpdated: data.updated_at,
    managerId: data.manager_id,
  }
}

export async function deleteConversation(sessionId) {
  const { error } = await supabase
    .from('alt_conversations')
    .delete()
    .eq('session_id', sessionId)
  return { error }
}

// ── Portfolio Summary (Multi-Manager Views) ──────────────────────────────

export async function getPortfolioSummary(managerIds = []) {
  let query = supabase.from('alt_facts').select('*')
  
  if (managerIds.length > 0) {
    query = query.in('manager_id', managerIds)
  }
  
  const { data, error } = await query
  
  if (error || !data?.length) {
    return {
      totalCommitted: null,
      totalCalled: null,
      totalNAV: null,
      avgIRR: null,
      count: 0,
    }
  }
  
  const totalCommitted = data.reduce((sum, f) => sum + (f.committed_capital_mm || 0), 0)
  const totalCalled = data.reduce((sum, f) => sum + (f.called_capital_mm || 0), 0)
  const totalNAV = data.reduce((sum, f) => sum + (f.fund_size_mm || 0), 0)
  const irrValues = data.filter(f => f.irr_net != null).map(f => f.irr_net)
  const avgIRR = irrValues.length ? irrValues.reduce((a, b) => a + b, 0) / irrValues.length : null
  
  return {
    totalCommitted,
    totalCalled,
    totalNAV,
    avgIRR,
    count: data.length,
  }
}

export async function getCashflowTimeline(managerId) {
  const { data, error } = await supabase
    .from('alt_cashflows')
    .select('*')
    .eq('manager_id', managerId)
    .order('cashflow_date', { ascending: true })
  
  if (error || !data) return []
  
  return data
}

// ── Metadata & Stats ─────────────────────────────────────────────────────

export async function getStats() {
  const { count: managerCount } = await supabase
    .from('alt_managers')
    .select('*', { count: 'exact', head: true })
  
  const { count: docCount } = await supabase
    .from('alt_docs')
    .select('*', { count: 'exact', head: true })
  
  const { count: factsCount } = await supabase
    .from('alt_facts')
    .select('*', { count: 'exact', head: true })
  
  return {
    managers: managerCount || 0,
    documents: docCount || 0,
    facts: factsCount || 0,
  }
}

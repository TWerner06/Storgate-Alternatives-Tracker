import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Alt Managers ──────────────────────────────────────────────────────────

export async function saveManager(manager: any) {
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
      pipeline_status: manager.pipeline_status || 'tracking',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fund_name' })
    .select()
  return { data, error }
}

export async function loadManager(managerId: string) {
  const { data, error } = await supabase
    .from('alt_managers')
    .select('*')
    .eq('id', managerId)
    .single()
  return { data, error }
}

export async function loadManagers(filters: { asset_class?: string; search?: string; pipeline_status?: string } = {}) {
  let query = supabase.from('alt_managers').select('*')
  if (filters.asset_class) query = query.eq('asset_class', filters.asset_class)
  if (filters.pipeline_status) query = query.eq('pipeline_status', filters.pipeline_status)
  if (filters.search) query = query.or(`fund_name.ilike.%${filters.search}%,manager_name.ilike.%${filters.search}%`)
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data, error }
}

export async function updateManagerStatus(managerId: string, pipelineStatus: string) {
  const { data, error } = await supabase
    .from('alt_managers')
    .update({ pipeline_status: pipelineStatus, updated_at: new Date().toISOString() })
    .eq('id', managerId)
    .select()
  return { data, error }
}

export async function updateManagerAssetClass(managerId: string, assetClass: string) {
  const { data, error } = await supabase
    .from('alt_managers')
    .update({ asset_class: assetClass, updated_at: new Date().toISOString() })
    .eq('id', managerId)
    .select()
  return { data, error }
}

export async function deleteManager(managerId: string) {
  const { error } = await supabase.from('alt_managers').delete().eq('id', managerId)
  return { error }
}

// ── Alt Documents ──────────────────────────────────────────────────────────

export async function saveDoc(doc: any) {
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

export async function updateDocStatus(docId: string, status: string, extractedText: string | null = null, pageCount: number | null = null) {
  const update: Record<string, any> = {
    status,
    extracted_at: status === 'extracted' ? new Date().toISOString() : null,
  }
  if (extractedText) update.extracted_text = extractedText
  if (pageCount) update.page_count = pageCount
  const { data, error } = await supabase.from('alt_docs').update(update).eq('id', docId).select()
  return { data: data?.[0], error }
}

export async function updateDocError(docId: string, errorMessage: string) {
  const { data, error } = await supabase
    .from('alt_docs')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', docId)
    .select()
  return { data: data?.[0], error }
}

export async function loadDocs(managerId: string) {
  const { data, error } = await supabase
    .from('alt_docs')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function loadDoc(docId: string) {
  const { data, error } = await supabase.from('alt_docs').select('*').eq('id', docId).single()
  return { data, error }
}

export async function deleteDoc(docId: string) {
  const { error } = await supabase.from('alt_docs').delete().eq('id', docId)
  return { error }
}

// ── Alt Facts ──────────────────────────────────────────────────────────────

export async function saveFacts(facts: any) {
  const { data, error } = await supabase.from('alt_facts').insert(facts).select()
  return { data: data?.[0], error }
}

export async function loadFacts(managerId: string) {
  const { data, error } = await supabase
    .from('alt_facts')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function loadFactsByDoc(docId: string) {
  const { data, error } = await supabase.from('alt_facts').select('*').eq('doc_id', docId).single()
  return { data, error }
}

export async function deleteFacts(factsId: string) {
  const { error } = await supabase.from('alt_facts').delete().eq('id', factsId)
  return { error }
}

// ── Alt Scores (persistent) ────────────────────────────────────────────────

export async function saveScores(managerId: string, scores: Record<string, number | null>, flags: Record<string, boolean>, flagReasons: Record<string, string | null>, composite: number | null, recommendation: string | null) {
  const { data, error } = await supabase
    .from('alt_scores')
    .upsert({
      manager_id: managerId,
      scores,
      flags,
      flag_reasons: flagReasons,
      composite_score: composite,
      recommendation,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'manager_id' })
    .select()
  return { data: data?.[0], error }
}

export async function loadScores(managerId: string) {
  const { data, error } = await supabase
    .from('alt_scores')
    .select('*')
    .eq('manager_id', managerId)
    .single()
  return { data, error }
}

// ── Alt Cashflows ──────────────────────────────────────────────────────────

export async function saveCashflow(cashflow: any) {
  const { data, error } = await supabase.from('alt_cashflows').insert(cashflow).select()
  return { data: data?.[0], error }
}

export async function loadCashflows(managerId: string) {
  const { data, error } = await supabase
    .from('alt_cashflows')
    .select('*')
    .eq('manager_id', managerId)
    .order('cashflow_date', { ascending: false })
  return { data, error }
}

// ── Alt Notes ──────────────────────────────────────────────────────────────

export async function saveNote(note: any) {
  const { data, error } = await supabase.from('alt_notes').insert(note).select()
  return { data: data?.[0], error }
}

export async function loadNotes(managerId: string, noteType: string | null = null) {
  let query = supabase.from('alt_notes').select('*').eq('manager_id', managerId)
  if (noteType) query = query.eq('note_type', noteType)
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data, error }
}

export async function updateNote(noteId: string, content: string) {
  const { data, error } = await supabase
    .from('alt_notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select()
  return { data: data?.[0], error }
}

export async function deleteNote(noteId: string) {
  const { error } = await supabase.from('alt_notes').delete().eq('id', noteId)
  return { error }
}

// ── Alt Conversations ──────────────────────────────────────────────────────

export async function saveConversation(sessionId: string, messages: any[], managerId: string | null = null) {
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

export async function loadConversation(sessionId: string) {
  const { data, error } = await supabase
    .from('alt_conversations')
    .select('messages, updated_at, manager_id')
    .eq('session_id', sessionId)
    .single()
  if (error || !data) return null
  return { messages: data.messages || [], lastUpdated: data.updated_at, managerId: data.manager_id }
}

export async function getStats() {
  const { count: managerCount } = await supabase.from('alt_managers').select('*', { count: 'exact', head: true })
  const { count: docCount } = await supabase.from('alt_docs').select('*', { count: 'exact', head: true })
  return { managers: managerCount || 0, documents: docCount || 0 }
}

// components/alt/ManagerDetail.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { loadDocs, loadFacts, loadNotes, loadCashflows, saveNote, loadScores, saveScores, updateManagerAssetClass } from '@/lib/supabase'
import { STAGE1_CONFIG, getRecommendation, calcComposite, SCALE_GUIDE, STAGE1_PASS_THRESHOLD } from '@/lib/alt-scoring'
import Stage2Scorecard from './Stage2Scorecard'
import RicherCharts from './RicherCharts'
import ConfirmationCheck from './ConfirmationCheck'
import PDFExportButton from './PDFExportButton'

const T = {
  navy: '#0B1929', blue: '#3B82F6', blueLight: '#EFF6FF', blueMid: '#93C5FD',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#F87171', redLight: '#FEF2F2',
  purple: '#8B5CF6', purpleLight: '#F5F3FF',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  sans: "'Inter', system-ui, sans-serif",
}

const SCORE_COLORS: Record<number, string> = { 1: '#EF4444', 2: '#F59E0B', 3: '#3B82F6', 4: '#10B981', 5: '#059669' }

const PIPELINE = [
  { id: 'tracking', label: 'Tracking', color: T.slate, bg: '#F1F5F9' },
  { id: 'near_investing', label: 'Near Investing', color: T.amber, bg: T.amberLight },
  { id: 'investing', label: 'Investing', color: T.green, bg: T.greenLight },
  { id: 'pass', label: 'Pass', color: '#CBD5E1', bg: '#F8FAFC' },
]

const ASSET_CLASSES = [
  'Private Equity','Private Credit','Hedge Funds','Managed Futures',
  'Private Real Estate','Energy','Crypto Assets','Opportunistic','Research',
]

const navBtn = (active: boolean): CSSProperties => ({
  padding: '0 18px', height: 44, border: 'none', background: 'transparent',
  cursor: 'pointer', color: active ? T.text : T.textLight,
  borderBottom: active ? `2px solid ${T.blue}` : '2px solid transparent',
  fontSize: 12, fontWeight: active ? 700 : 400, marginBottom: -1,
  fontFamily: T.sans, letterSpacing: '-.01em',
})

const scoreBtn = (active: boolean, score: number): CSSProperties => ({
  width: 36, height: 36, borderRadius: 7,
  border: `1.5px solid ${active ? SCORE_COLORS[score] : T.border}`,
  background: active ? SCORE_COLORS[score] : T.surface,
  color: active ? '#fff' : T.textLight,
  fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all .1s',
  fontFamily: T.mono,
})

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontFamily: T.mono, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

interface Props { manager: any; onBack: () => void; onStatusChange: (id: string, status: string) => void }

export default function ManagerDetail({ manager, onBack, onStatusChange }: Props) {
  const [docs, setDocs] = useState<any[]>([])
  const [facts, setFacts] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [cashflows, setCashflows] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(manager.pipeline_status || 'tracking')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [scoreConfidence, setScoreConfidence] = useState<Record<string, 'H' | 'M' | 'L' | null>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [flagReasons, setFlagReasons] = useState<Record<string, string | null>>({})
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [aiScoring, setAiScoring] = useState(false)
  const [savingScores, setSavingScores] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [assetClass, setAssetClass] = useState(manager.asset_class)
  const [reExtracting, setReExtracting] = useState(false)
  const [reExtractResult, setReExtractResult] = useState<{ success: boolean; message: string } | null>(null)

  const config = STAGE1_CONFIG[assetClass] || STAGE1_CONFIG['Private Equity']
  const [stage2Unlocked, setStage2Unlocked] = useState(manager.stage2_unlocked || false)
  const [unlockingStage2, setUnlockingStage2] = useState(false)
  const composite = calcComposite(scores)
  const currentPipeline = PIPELINE.find(p => p.id === status) || PIPELINE[0]

  // Fixed: converts millions to billions for large values (e.g. $31,530M → $31.5B)
  const fmt = {
    pct: (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(2)}%`,
    mm:  (v: number | null) => v == null ? '—' : v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v.toFixed(0)}M`,
    x:   (v: number | null) => v == null ? '—' : `${v.toFixed(2)}x`,
    mo:  (v: number | null) => v == null ? '—' : `${v}mo`,
  }

  useEffect(() => { load() }, [manager.id])

  async function load() {
    setLoading(true)
    try {
      const [d, f, n, c, s] = await Promise.all([
        loadDocs(manager.id), loadFacts(manager.id), loadNotes(manager.id),
        loadCashflows(manager.id), loadScores(manager.id),
      ])
      if (d.data) setDocs(d.data)
      if (f.data?.length) setFacts(f.data[0])
      if (n.data) setNotes(n.data)
      if (c.data) setCashflows(c.data)
      if (s.data) { setScores(s.data.scores || {}); setFlags(s.data.flags || {}); setFlagReasons(s.data.flag_reasons || {}) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // Re-extract: re-runs the full extraction pipeline on all stored document text
  // for this fund, replacing old facts with clean data from the new pipeline.
  async function reExtract() {
    if (!confirm(`Re-extract all documents for "${manager.fund_name}"? This will replace all existing extracted data with a fresh run through the new pipeline.`)) return
    setReExtracting(true)
    setReExtractResult(null)
    try {
      const r = await fetch('/api/alt/re-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: manager.id }),
      })
      const d = await r.json()
      if (d.success) {
        const { docsProcessed, docsSkipped, docsFailed } = d.summary
        setReExtractResult({
          success: true,
          message: `Done — ${docsProcessed} doc${docsProcessed !== 1 ? 's' : ''} re-extracted, ${docsSkipped} skipped (market reports), ${docsFailed} failed.`,
        })
        // Reload facts so the UI reflects the updated data
        await load()
      } else {
        setReExtractResult({ success: false, message: d.error || 'Re-extraction failed' })
      }
    } catch (e: any) {
      setReExtractResult({ success: false, message: e.message || 'Network error' })
    } finally {
      setReExtracting(false)
    }
  }

  async function aiScore() {
    setAiScoring(true)
    try {
      const r = await fetch('/api/alt/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ managerId: manager.id, assetClass }) })
      const d = await r.json()
      if (d.scores) {
        setScores(d.scores)
        setScoreConfidence(d.confidence || {})
        setFlags(d.flags || {})
        setFlagReasons(d.flag_reasons || {})
        const comp = calcComposite(d.scores)
        const rec = comp ? getRecommendation(comp) : null
        await saveScores(manager.id, d.scores, d.flags || {}, d.flag_reasons || {}, comp, rec?.label || null)
      }
    } catch (e) { console.error(e) }
    finally { setAiScoring(false) }
  }

  async function saveNote_() {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await saveNote({ manager_id: manager.id, note_type: 'general', content: newNote })
      setNewNote('')
      const { data } = await loadNotes(manager.id)
      if (data) setNotes(data)
    } catch (e) { console.error(e) }
    finally { setSavingNote(false) }
  }

  async function handleStatusChange(s: string) {
    setStatus(s); onStatusChange(manager.id, s)
  }

  async function reassign(ac: string) {
    await updateManagerAssetClass(manager.id, ac)
    setAssetClass(ac); setShowReassign(false)
  }

  async function persistScores() {
    setSavingScores(true)
    try {
      const rec = composite ? getRecommendation(composite) : null
      await saveScores(manager.id, scores, flags, flagReasons, composite, rec?.label || null)
    } catch (e) { console.error(e) }
    finally { setSavingScores(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: T.textLight }}>Loading...</div>

  const returnData = [
    facts?.irr_net != null && { name: 'Net IRR', value: parseFloat((facts.irr_net * 100).toFixed(1)), fill: T.blue },
    facts?.irr_gross != null && { name: 'Gross IRR', value: parseFloat((facts.irr_gross * 100).toFixed(1)), fill: T.blueMid },
    facts?.target_irr != null && { name: 'Target IRR', value: parseFloat((facts.target_irr * 100).toFixed(1)), fill: '#BFDBFE' },
  ].filter(Boolean) as any[]

  const multiplesData = [
    facts?.tvpi != null && { name: 'TVPI', value: facts.tvpi, fill: T.green },
    facts?.dpi != null && { name: 'DPI', value: facts.dpi, fill: '#6EE7B7' },
    facts?.moic != null && { name: 'MOIC', value: facts.moic, fill: '#A7F3D0' },
  ].filter(Boolean) as any[]

  const capitalData = [
    facts?.fund_size_mm != null && { name: 'Target', value: facts.fund_size_mm, fill: T.purple },
    facts?.committed_capital_mm != null && { name: 'Committed', value: facts.committed_capital_mm, fill: '#A78BFA' },
    facts?.called_capital_mm != null && { name: 'Called', value: facts.called_capital_mm, fill: '#C4B5FD' },
  ].filter(Boolean) as any[]

  const cfData = cashflows.slice(0, 8).map((cf: any) => ({
    name: new Date(cf.cashflow_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    value: cf.cashflow_type === 'Capital Call' ? -cf.amount_mm : cf.amount_mm,
    fill: cf.cashflow_type === 'Capital Call' ? T.red : T.green,
  }))

  const sCard: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px' }
  const sLabel: CSSProperties = { fontSize: 9, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.09em', fontFamily: T.mono, marginBottom: 6 }
  const sVal: CSSProperties = { fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.mono, letterSpacing: '-.02em' }
  const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 16 }
  const secTitle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }
  const infoLbl: CSSProperties = { fontSize: 10, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, fontFamily: T.mono }
  const infoVal: CSSProperties = { fontSize: 13, color: '#334155', lineHeight: 1.7 }
  const emptyS: CSSProperties = { textAlign: 'center', padding: '40px', color: T.textLight, fontSize: 12 }
  const scoreR: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10, padding: '13px 16px', background: '#FAFBFD', borderRadius: 9, border: `1px solid ${T.border}` }
  const bucketH: CSSProperties = { fontSize: 11, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 10, marginTop: 20, paddingBottom: 8, borderBottom: `2px solid ${T.blueLight}`, fontFamily: T.sans }
  const noteArea: CSSProperties = { width: '100%', padding: '12px 14px', border: `1.5px solid ${T.border}`, borderRadius: 9, fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 100, boxSizing: 'border-box', marginBottom: 10, fontFamily: T.sans, lineHeight: 1.7, color: T.text, background: '#FAFBFD' }

  const scoringCriteria = config?.criteria || []
  const scoringFlags = config?.flags || []
  const buckets = ['returns', 'process', 'people'] as const

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.blue, fontWeight: 600, padding: 0, marginBottom: 12, fontFamily: T.sans }}>
          ← Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.navy, letterSpacing: '-.03em', marginBottom: 6, fontFamily: T.sans }}>{manager.fund_name}</div>
            <div style={{ fontSize: 12, color: T.textLight, fontFamily: T.mono }}>{manager.manager_name} · {assetClass}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowReassign(!showReassign)} style={{ padding: '6px 13px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', color: T.textMid, fontWeight: 600, fontFamily: T.sans }}>
                Move ▾
              </button>
              {showReassign && (
                <div style={{ position: 'absolute', right: 0, top: 38, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 200, overflow: 'hidden' }}>
                  {ASSET_CLASSES.map(ac => (
                    <button key={ac} onClick={() => reassign(ac)} style={{ display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left', background: ac === assetClass ? T.blueLight : T.surface, color: ac === assetClass ? T.blue : T.text, border: 'none', fontSize: 12, cursor: 'pointer', borderBottom: `1px solid ${T.bg}`, fontWeight: ac === assetClass ? 700 : 400, fontFamily: T.sans }}>
                      {ac === assetClass ? '✓ ' : ''}{ac}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Re-extract button */}
            <button
              onClick={reExtract}
              disabled={reExtracting}
              style={{
                padding: '6px 13px', background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 7,
                fontSize: 11, cursor: reExtracting ? 'wait' : 'pointer',
                color: T.textMid, fontWeight: 600, fontFamily: T.sans,
                transition: 'all .15s',
                opacity: reExtracting ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (!reExtracting) {
                  (e.currentTarget as HTMLButtonElement).style.background = T.blueLight
                  ;(e.currentTarget as HTMLButtonElement).style.color = T.blue
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = T.blue
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = T.surface
                ;(e.currentTarget as HTMLButtonElement).style.color = T.textMid
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = T.border
              }}
            >
              {reExtracting ? '⏳ Re-extracting...' : '↺ Re-extract'}
            </button>

            {/* Delete Fund button */}
            <button
              onClick={async () => {
                if (!confirm(`Permanently delete "${manager.fund_name}" and all its data? This cannot be undone.`)) return
                try {
                  const { createClient } = await import('@supabase/supabase-js')
                  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
                  await sb.from('alt_docs').delete().eq('manager_id', manager.id)
                  await sb.from('alt_facts').delete().eq('manager_id', manager.id)
                  await sb.from('alt_scores').delete().eq('manager_id', manager.id)
                  await sb.from('alt_managers').delete().eq('id', manager.id)
                  onBack()
                } catch (e) {
                  console.error(e)
                  alert('Failed to delete fund — please try again')
                }
              }}
              style={{ padding: '6px 13px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', color: T.textLight, fontWeight: 600, fontFamily: T.sans, transition: 'all .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = T.red; (e.currentTarget as HTMLButtonElement).style.borderColor = T.red }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.surface; (e.currentTarget as HTMLButtonElement).style.color = T.textLight; (e.currentTarget as HTMLButtonElement).style.borderColor = T.border }}
            >
              ✕ Delete Fund
            </button>

            <div style={{ padding: '6px 16px', background: currentPipeline.bg, color: currentPipeline.color, borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${currentPipeline.color}44`, fontFamily: T.sans }}>
              {currentPipeline.label}
            </div>
          </div>
        </div>

        {/* Re-extract result banner */}
        {reExtractResult && (
          <div style={{
            marginBottom: 12, padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: reExtractResult.success ? T.greenLight : '#FEF2F2',
            color: reExtractResult.success ? '#065F46' : '#991B1B',
            border: `1px solid ${reExtractResult.success ? T.green + '44' : T.red + '44'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{reExtractResult.success ? '✓ ' : '✕ '}{reExtractResult.message}</span>
            <button onClick={() => setReExtractResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: '0 4px' }}>✕</button>
          </div>
        )}

        {/* Pipeline selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {PIPELINE.map(p => (
            <button key={p.id} onClick={() => handleStatusChange(p.id)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: status === p.id ? 700 : 400, border: `1px solid ${status === p.id ? p.color : T.border}`, background: status === p.id ? p.bg : T.surface, color: status === p.id ? p.color : T.textMid, fontFamily: T.sans }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      {facts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
          {facts.fund_size_mm != null && <div style={sCard}><div style={sLabel}>Fund Size</div><div style={sVal}>{fmt.mm(facts.fund_size_mm)}</div></div>}
          {facts.irr_net != null && <div style={{ ...sCard, borderTop: `3px solid ${facts.irr_net > 0 ? T.green : T.red}` }}><div style={sLabel}>Net IRR</div><div style={{ ...sVal, color: facts.irr_net > 0 ? T.green : T.red }}>{fmt.pct(facts.irr_net)}</div></div>}
          {facts.irr_gross != null && <div style={sCard}><div style={sLabel}>Gross IRR</div><div style={sVal}>{fmt.pct(facts.irr_gross)}</div></div>}
          {facts.tvpi != null && <div style={{ ...sCard, borderTop: `3px solid ${T.green}` }}><div style={sLabel}>TVPI</div><div style={{ ...sVal, color: T.green }}>{fmt.x(facts.tvpi)}</div></div>}
          {facts.dpi != null && <div style={sCard}><div style={sLabel}>DPI</div><div style={sVal}>{fmt.x(facts.dpi)}</div></div>}
          {facts.moic != null && <div style={sCard}><div style={sLabel}>MOIC</div><div style={sVal}>{fmt.x(facts.moic)}</div></div>}
          {facts.management_fee_pct != null && <div style={{ ...sCard, borderTop: `3px solid ${T.amber}` }}><div style={sLabel}>Mgmt Fee</div><div style={{ ...sVal, color: T.amber }}>{fmt.pct(facts.management_fee_pct)}</div></div>}
          {facts.carry_pct != null && <div style={sCard}><div style={sLabel}>Carry</div><div style={sVal}>{fmt.pct(facts.carry_pct)}</div></div>}
          {facts.gp_commitment_pct != null && <div style={sCard}><div style={sLabel}>GP Commit</div><div style={sVal}>{fmt.pct(facts.gp_commitment_pct)}</div></div>}
          {facts.hurdle_rate != null && <div style={sCard}><div style={sLabel}>Hurdle</div><div style={sVal}>{fmt.pct(facts.hurdle_rate)}</div></div>}
          {facts.lock_up_months != null && <div style={sCard}><div style={sLabel}>Lock-up</div><div style={sVal}>{fmt.mo(facts.lock_up_months)}</div></div>}
        </div>
      )}

      {/* Stage 2 unlock banner */}
      {composite != null && composite >= STAGE1_PASS_THRESHOLD && !stage2Unlocked && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>
              ★ Stage 1 Score: {composite.toFixed(2)} — Ready for Full Underwriting
            </div>
            <div style={{ fontSize: 12, color: '#B45309' }}>
              This fund meets the threshold for Stage 2 detailed evaluation. Unlock the full underwriting scorecard?
            </div>
          </div>
          <button
            onClick={async () => {
              setUnlockingStage2(true)
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
                await sb.from('alt_managers').update({ stage2_unlocked: true, current_stage: 2 }).eq('id', manager.id)
                setStage2Unlocked(true)
              } catch (e) { console.error(e) }
              finally { setUnlockingStage2(false) }
            }}
            disabled={unlockingStage2}
            style={{ padding: '8px 18px', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}
          >
            {unlockingStage2 ? 'Unlocking...' : '→ Unlock Stage 2'}
          </button>
        </div>
      )}

      {/* Stage 2 unlocked indicator */}
      {stage2Unlocked && (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 10, padding: '10px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: '#059669' }}>✓</span>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#065F46' }}>Stage 2 Full Underwriting Unlocked — detailed scorecard available in Scorecard tab</div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 20, background: T.surface, borderRadius: '12px 12px 0 0', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        {(['overview', 'scorecard', ...(stage2Unlocked ? ['stage2'] : []), 'charts', 'documents', 'notes', 'cashflows']).map(t => (
          <button key={t} onClick={() => setTab(t)} style={navBtn(tab === t)}>
            {t === 'stage2' ? '★ Stage 2' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <>
          {facts?.deployment_pace_concern && (() => {
            const concern = facts.deployment_pace_concern as string
            const hasErrorFlag = concern.includes('[ERROR]') || concern.includes('[QUOTE VERIFICATION') || concern.includes('[ATTRIBUTION')
            const hasWarningFlag = concern.includes('[WARNING]') || concern.includes('[NOTE') || concern.includes('[CLASSIFICATION') || concern.includes('[RE-EXTRACT')
            if (!hasErrorFlag && !hasWarningFlag) return null
            return (
              <div style={{
                ...sec,
                background: hasErrorFlag ? '#FEF2F2' : T.amberLight,
                border: `1px solid ${hasErrorFlag ? T.red + '44' : T.amber + '44'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14 }}>{hasErrorFlag ? '⚠' : 'ℹ'}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: hasErrorFlag ? '#991B1B' : '#92400E', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Data Quality — Review Recommended
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: hasErrorFlag ? '#7F1D1D' : '#78350F', lineHeight: 1.6 }}>
                  {concern}
                </div>
              </div>
            )
          })()}

          <div style={sec}>
            <div style={secTitle}>Fund Information</div>
            {facts ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  {facts.investment_strategy && <div style={{ marginBottom: 18 }}><div style={infoLbl}>Strategy</div><div style={infoVal}>{facts.investment_strategy}</div></div>}
                  {facts.target_geographies?.length > 0 && <div style={{ marginBottom: 18 }}><div style={infoLbl}>Geographies</div><div style={infoVal}>{facts.target_geographies.join(', ')}</div></div>}
                  {facts.target_sectors?.length > 0 && <div style={{ marginBottom: 18 }}><div style={infoLbl}>Sectors</div><div style={infoVal}>{facts.target_sectors.join(', ')}</div></div>}
                </div>
                <div>
                  {facts.key_personnel?.length > 0 && <div style={{ marginBottom: 18 }}><div style={infoLbl}>Key Personnel</div>{facts.key_personnel.map((p: string, i: number) => <div key={i} style={{ ...infoVal, marginBottom: 3 }}>· {p}</div>)}</div>}
                  {facts.style_drift_flags?.length > 0 && (
                    <div style={{ marginBottom: 18, padding: '12px 14px', background: T.amberLight, borderRadius: 8, border: `1px solid ${T.amber}33` }}>
                      <div style={{ ...infoLbl, color: T.amber }}>⚠ Style Drift Flags</div>
                      {facts.style_drift_flags.map((f: string, i: number) => <div key={i} style={{ fontSize: 12, color: '#92400E', marginBottom: 3 }}>· {f}</div>)}
                    </div>
                  )}
                  {facts.concentration_risks?.length > 0 && (
                    <div style={{ padding: '12px 14px', background: '#FEF2F2', borderRadius: 8, border: `1px solid ${T.red}33` }}>
                      <div style={{ ...infoLbl, color: T.red }}>⚠ Concentration Risks</div>
                      {facts.concentration_risks.map((r: string, i: number) => <div key={i} style={{ fontSize: 12, color: '#991B1B', marginBottom: 3 }}>· {r}</div>)}
                    </div>
                  )}
                </div>
              </div>
            ) : <div style={emptyS}>No data extracted yet. Upload a fund document.</div>}
          </div>
        </>
      )}

      {/* SCORECARD */}
      {tab === 'scorecard' && (
        <>
          <div style={sec}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={secTitle}>Scorecard — {config?.label}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={persistScores} disabled={savingScores || !composite} style={{ padding: '6px 14px', background: !composite ? T.bg : T.navy, color: !composite ? T.textLight : '#fff', border: 'none', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontWeight: 600, fontFamily: T.sans }}>
                  {savingScores ? 'Saving...' : '↓ Save'}
                </button>
                <button onClick={aiScore} disabled={aiScoring} style={{ padding: '6px 14px', background: aiScoring ? T.bg : T.blue, color: aiScoring ? T.textLight : '#fff', border: 'none', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontWeight: 600, fontFamily: T.sans }}>
                  {aiScoring ? '⏳ Scoring...' : '✦ AI Score'}
                </button>
                <PDFExportButton
                  fundName={manager.fund_name}
                  gp={manager.manager_name}
                  assetClass={assetClass}
                  facts={facts}
                  scores={scores}
                  stage1Score={composite}
                  notes={notes.map((n: any) => n.content).join('\n\n')}
                />
              </div>
            </div>
            {composite != null ? (() => {
              const rec = getRecommendation(composite)
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 48, fontWeight: 900, color: rec.color, fontFamily: T.mono, lineHeight: 1 }}>{composite.toFixed(2)}</div>
                    <div style={{ fontSize: 9, color: T.textLight, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>out of 5.00</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ background: T.bg, borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ width: `${((composite - 1) / 4) * 100}%`, background: rec.color, height: '100%', borderRadius: 6 }} />
                    </div>
                    <div style={{ display: 'inline-block', padding: '5px 16px', background: rec.color + '18', color: rec.color, borderRadius: 20, fontSize: 13, fontWeight: 800, border: `1px solid ${rec.color}33` }}>{rec.label}</div>
                    <div style={{ fontSize: 11, color: T.textMid, marginTop: 6 }}>{rec.action}</div>
                  </div>
                </div>
              )
            })() : <div style={emptyS}>Click AI Score or score manually below</div>}
          </div>

          <div style={{ ...sec, padding: '12px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {SCALE_GUIDE.map(s => (
                <div key={s.score} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: SCORE_COLORS[s.score], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 12, fontFamily: T.mono }}>{s.score}</div>
                  <span style={{ color: T.textMid, fontWeight: 500, fontFamily: T.sans }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={sec}>
            {buckets.map(bucket => {
              const criteria = scoringCriteria.filter(c => c.bucket === bucket)
              if (!criteria.length) return null
              return (
                <div key={bucket}>
                  <div style={bucketH}>{config?.bucketLabels[bucket] || bucket}</div>
                  {criteria.map(c => (
                    <div key={c.id} style={scoreR}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3, letterSpacing: '-.01em', fontFamily: T.sans }}>{c.label}</div>
                        <div style={{ fontSize: 11, color: T.textLight, lineHeight: 1.6 }}>{c.what_to_look_for}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setScores(p => ({ ...p, [c.id]: p[c.id] === n ? null : n }))} style={scoreBtn(scores[c.id] === n, n)}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {scoringFlags.length > 0 && (
            <div style={sec}>
              <div style={secTitle}>⚠ Red Flags</div>
              <div style={{ fontSize: 11, color: T.textLight, marginBottom: 14 }}>Auto-checked by AI · override manually if needed</div>
              {scoringFlags.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, padding: '11px 14px', background: flags[f.id] ? '#FEF2F2' : '#FAFBFD', borderRadius: 8, border: `1px solid ${flags[f.id] ? T.red + '44' : T.border}` }}>
                  <input type="checkbox" checked={flags[f.id] || false} onChange={e => setFlags(p => ({ ...p, [f.id]: e.target.checked }))} style={{ width: 15, height: 15, cursor: 'pointer', marginTop: 2, accentColor: T.red }} />
                  <div>
                    <div style={{ fontSize: 13, color: flags[f.id] ? '#991B1B' : T.text, fontWeight: flags[f.id] ? 700 : 400, fontFamily: T.sans }}>{f.label}</div>
                    {flagReasons[f.id] && <div style={{ fontSize: 11, color: T.textLight, marginTop: 3 }}>{flagReasons[f.id]}</div>}
                  </div>
                </div>
              ))}
              {Object.values(flags).some(Boolean) && (
                <div style={{ marginTop: 12, padding: '10px 16px', background: '#FEF2F2', borderRadius: 8, fontSize: 12, color: '#991B1B', fontWeight: 600, border: `1px solid ${T.red}44` }}>
                  ⚠ {Object.values(flags).filter(Boolean).length} flag(s) active — watch-list review triggered
                </div>
              )}
            </div>
          )}

          {Object.keys(scores).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                ✓ Data Verification — Stage 1
              </div>
              <ConfirmationCheck
                managerId={manager.id}
                criteriaScores={scores}
                confidence={scoreConfidence}
                criteria={scoringCriteria}
              />
            </div>
          )}
        </>
      )}

      {/* CHARTS */}
      {tab === 'charts' && (
        <RicherCharts facts={facts} cashflows={cashflows} scores={scores} />
      )}

      {/* DOCUMENTS */}
      {tab === 'documents' && (
        <div style={sec}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.08em' }}>Documents ({docs.length})</div>
            <label style={{
              padding: '6px 14px', background: T.blue, color: '#fff', borderRadius: 7,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const btn = e.target.closest('label') as HTMLLabelElement
                  if (btn) btn.textContent = '⏳ Uploading...'
                  try {
                    const formData = new FormData()
                    formData.append('file', file)
                    formData.append('managerId', manager.id)
                    const r = await fetch('/api/alt/upload-to-fund', { method: 'POST', body: formData })
                    if (!r.ok) throw new Error('Upload failed')
                    const { data: d } = await loadDocs(manager.id)
                    if (d) setDocs(d)
                  } catch (err) {
                    alert('Upload failed — please try again')
                    console.error(err)
                  }
                  if (btn) { btn.innerHTML = '+ Add Document' }
                  e.target.value = ''
                }}
              />
              + Add Document
            </label>
          </div>
          {docs.length === 0 ? <div style={emptyS}>No documents yet — click Add Document to upload</div> : docs.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#FAFBFD', border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 3 }}>{d.doc_name}</div>
                <div style={{ fontSize: 11, color: T.textLight }}>{new Date(d.created_at).toLocaleDateString()} · {d.file_size_kb}KB{d.page_count ? ` · ${d.page_count}p` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: T.textLight, background: T.bg, padding: '2px 8px', borderRadius: 5, fontFamily: T.mono }}>{d.doc_type}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, fontFamily: T.mono, color: d.status === 'extracted' ? T.green : T.red, background: d.status === 'extracted' ? T.greenLight : '#FEF2F2' }}>{d.status}</span>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${d.doc_name}"? This cannot be undone.`)) return
                    try {
                      const { createClient } = await import('@supabase/supabase-js')
                      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
                      await sb.from('alt_docs').delete().eq('id', d.id)
                      setDocs(prev => prev.filter(doc => doc.id !== d.id))
                    } catch (e) { console.error(e); alert('Failed to delete document') }
                  }}
                  style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, color: T.textLight, cursor: 'pointer', fontWeight: 600, transition: 'all .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = T.red; (e.currentTarget as HTMLButtonElement).style.borderColor = T.red }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = T.textLight; (e.currentTarget as HTMLButtonElement).style.borderColor = T.border }}
                >
                  ✕ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NOTES */}
      {tab === 'notes' && (
        <div style={sec}>
          <div style={secTitle}>Investment Notes</div>
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note — investment thesis, concerns, GP conversation notes, follow-up items..." style={noteArea}
            onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.background = T.surface }}
            onBlur={e => { e.target.style.borderColor = T.border; e.target.style.background = '#FAFBFD' }}
          />
          <button onClick={saveNote_} disabled={savingNote} style={{ padding: '8px 20px', background: savingNote ? T.bg : T.navy, color: savingNote ? T.textLight : '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: T.sans }}>
            {savingNote ? 'Saving...' : 'Save Note'}
          </button>
          <div style={{ marginTop: 24 }}>
            {notes.length === 0 ? <div style={emptyS}>No notes yet</div> : notes.map(n => (
              <div key={n.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: T.mono }}>
                  {n.note_type} · {new Date(n.created_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.8 }}>{n.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STAGE 2 */}
      {tab === 'stage2' && stage2Unlocked && (
        <Stage2Scorecard manager={manager} />
      )}

      {/* CASHFLOWS */}
      {tab === 'cashflows' && (
        <div style={sec}>
          <div style={secTitle}>Capital Activity</div>
          {cashflows.length === 0 ? <div style={emptyS}>No cash flows recorded yet</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {cashflows.map((cf: any) => (
                <div key={cf.id} style={{ ...sCard, borderTop: `3px solid ${cf.cashflow_type === 'Capital Call' ? T.red : T.green}` }}>
                  <div style={sLabel}>{cf.cashflow_type}</div>
                  <div style={{ ...sVal, fontSize: 18, color: cf.cashflow_type === 'Capital Call' ? T.red : T.green }}>
                    {cf.cashflow_type === 'Capital Call' ? '-' : '+'}{fmt.mm(cf.amount_mm)}
                  </div>
                  <div style={{ fontSize: 10, color: T.textLight, marginTop: 6, fontFamily: T.mono }}>{new Date(cf.cashflow_date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

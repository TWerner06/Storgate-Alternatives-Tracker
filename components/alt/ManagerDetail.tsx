// components/alt/ManagerDetail.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadDocs, loadFacts, loadNotes, loadCashflows, saveNote } from '@/lib/supabase'
import { ALT_SCORING_CONFIG, getRecommendation, calcComposite, SCALE_GUIDE } from '@/lib/alt-scoring'

const PIPELINE_STATUSES = [
  { id: 'tracking', label: 'Tracking', color: '#6B7FA3', bg: '#EEF1F8' },
  { id: 'near_investing', label: 'Near Investing', color: '#B8860B', bg: '#FDF8E6' },
  { id: 'investing', label: 'Investing', color: '#2D6A2D', bg: '#EDF7ED' },
  { id: 'pass', label: 'Pass', color: '#888', bg: '#F5F4F1' },
]

interface ManagerDetailProps {
  manager: any
  onBack: () => void
}

export default function ManagerDetail({ manager, onBack }: ManagerDetailProps) {
  const [documents, setDocuments] = useState<any[]>([])
  const [facts, setFacts] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [cashflows, setCashflows] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [pipelineStatus, setPipelineStatus] = useState(manager.pipeline_status || 'tracking')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [aiScoring, setAiScoring] = useState(false)

  const assetConfig = ALT_SCORING_CONFIG[manager.asset_class] || ALT_SCORING_CONFIG['Private Equity']
  const composite = calcComposite(scores)
  const recommendation = composite ? getRecommendation(composite) : null

  useEffect(() => { loadData() }, [manager.id])

  async function loadData() {
    setLoading(true)
    try {
      const [docsRes, factsRes, notesRes, cfRes] = await Promise.all([
        loadDocs(manager.id),
        loadFacts(manager.id),
        loadNotes(manager.id),
        loadCashflows(manager.id),
      ])
      if (docsRes.data) setDocuments(docsRes.data)
      if (factsRes.data?.length) setFacts(factsRes.data[0])
      if (notesRes.data) setNotes(notesRes.data)
      if (cfRes.data) setCashflows(cfRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAiScore() {
    setAiScoring(true)
    try {
      const res = await fetch('/api/alt/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: manager.id, assetClass: manager.asset_class }),
      })
      const data = await res.json()
      if (data.scores) setScores(data.scores)
    } catch (err) {
      console.error(err)
    } finally {
      setAiScoring(false)
    }
  }

  async function handleSaveNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await saveNote({ manager_id: manager.id, note_type: 'general', content: newNote })
      setNewNote('')
      const { data } = await loadNotes(manager.id)
      if (data) setNotes(data)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingNote(false)
    }
  }

  // ── Mini bar chart ────────────────────────────────────────────────────────
  function MiniBarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
    const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80, fontSize: 10, color: '#888', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
            <div style={{ flex: 1, background: '#f0eeea', borderRadius: 3, height: 16, overflow: 'hidden' }}>
              <div style={{
                width: `${(Math.abs(d.value) / max) * 100}%`,
                background: d.value < 0 ? '#A02020' : color,
                height: '100%',
                borderRadius: 3,
                transition: 'width .4s ease',
              }} />
            </div>
            <div style={{ width: 48, fontSize: 11, fontFamily: 'monospace', color: d.value < 0 ? '#A02020' : '#111' }}>
              {d.value}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Gauge chart (composite score) ─────────────────────────────────────────
  function ScoreGauge({ score }: { score: number }) {
    const pct = ((score - 1) / 4) * 100
    const rec = getRecommendation(score)
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{
          fontSize: 48,
          fontWeight: 700,
          color: rec.color,
          fontFamily: 'monospace',
          lineHeight: 1,
          marginBottom: 4,
        }}>
          {score.toFixed(2)}
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>out of 5.00</div>
        <div style={{ background: '#f0eeea', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{
            width: `${pct}%`,
            background: rec.color,
            height: '100%',
            borderRadius: 4,
            transition: 'width .5s ease',
          }} />
        </div>
        <div style={{
          display: 'inline-block',
          padding: '4px 12px',
          background: rec.color + '22',
          color: rec.color,
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {rec.label}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{rec.action}</div>
      </div>
    )
  }

  // ── Pipeline status badge ─────────────────────────────────────────────────
  const currentStatus = PIPELINE_STATUSES.find(s => s.id === pipelineStatus) || PIPELINE_STATUSES[0]

  // ── Format helpers ────────────────────────────────────────────────────────
  const fmt = {
    pct: (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(2)}%`,
    mm: (v: number | null) => v == null ? '—' : `$${v}M`,
    x: (v: number | null) => v == null ? '—' : `${v.toFixed(2)}x`,
    mo: (v: number | null) => v == null ? '—' : `${v}mo`,
    num: (v: number | null) => v == null ? '—' : v.toString(),
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const S: Record<string, CSSProperties> = {
    container: { maxWidth: 1100, margin: '0 auto' },
    header: { marginBottom: 20 },
    backBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1A4A8A', fontWeight: 500, marginBottom: 12, padding: 0 },
    titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    title: { fontSize: 22, fontWeight: 700, color: '#111' },
    subtitle: { fontSize: 12, color: '#aaa', fontFamily: 'monospace' },
    statusRow: { display: 'flex', gap: 6, marginTop: 10 },
    statusBtn: (active: boolean, s: { id: string; label: string; color: string; bg: string }): CSSProperties => ({
      padding: '5px 12px',
      borderRadius: 20,
      border: `1px solid ${active ? s.color : '#d0cec8'}`,
      background: active ? s.bg : '#fff',
      color: active ? s.color : '#888',
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
    }),
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 },
    statCard: { background: '#fff', border: '1px solid #e0deda', borderRadius: 8, padding: '10px 12px' },
    statLabel: { fontSize: 9, color: '#aaa', textTransform: 'uppercase' as const, marginBottom: 4, fontFamily: 'monospace', letterSpacing: '.05em' },
    statValue: { fontSize: 17, fontWeight: 600, color: '#111', fontFamily: 'monospace' },
    nav: { display: 'flex', gap: 0, borderBottom: '1px solid #e0deda', marginBottom: 16 },
    navBtn: (active: boolean): CSSProperties => ({
      fontSize: 12, padding: '8px 16px', border: 'none', background: 'transparent',
      cursor: 'pointer', color: active ? '#111' : '#888',
      borderBottom: active ? '2px solid #111' : '2px solid transparent',
      fontWeight: active ? 500 : 400, marginBottom: -1,
    }),
    section: { background: '#fff', border: '1px solid #e0deda', borderRadius: 8, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0eeea' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
    label: { fontSize: 10, color: '#aaa', textTransform: 'uppercase' as const, marginBottom: 4, fontFamily: 'monospace' },
    value: { fontSize: 13, color: '#333', lineHeight: 1.5 },
    scoreRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', background: '#fafaf8', borderRadius: 6 },
    scoreLabel: { flex: 1, fontSize: 13, color: '#333' },
    scoreSub: { fontSize: 10, color: '#aaa', marginTop: 2 },
    scoreBtns: { display: 'flex', gap: 4 },
    scoreBtn: (active: boolean, score: number): CSSProperties => {
      const colors = ['', '#A02020', '#B8860B', '#1A4A8A', '#4A8A4A', '#2D6A2D']
      return {
        width: 32, height: 32, borderRadius: 6,
        border: `1px solid ${active ? colors[score] : '#d0cec8'}`,
        background: active ? colors[score] : '#fff',
        color: active ? '#fff' : '#888',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }
    },
    flagRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    docItem: { background: '#fafaf8', border: '1px solid #f0eeea', borderRadius: 5, padding: 10, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    badge: { fontSize: 10, color: '#aaa', fontFamily: 'monospace', background: '#f5f4f1', padding: '2px 6px', borderRadius: 3 },
    noteInput: { width: '100%', padding: '10px', border: '1px solid #d0cec8', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical' as const, minHeight: 80, boxSizing: 'border-box' as const, marginBottom: 8 },
    saveBtn: { padding: '8px 16px', background: '#0F1E2E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
    emptyState: { textAlign: 'center' as const, padding: '40px 20px', color: '#aaa', fontSize: 12 },
    bucketHeader: { fontSize: 11, fontWeight: 600, color: '#1A4A8A', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 8, marginTop: 16, paddingBottom: 4, borderBottom: '1px solid #EEF3FB' },
  }

  if (loading) return (
    <div style={S.container}>
      <button onClick={onBack} style={S.backBtn}>← Back</button>
      <div style={{ textAlign: 'center', padding: '60px', color: '#aaa' }}>Loading...</div>
    </div>
  )

  const scoringCriteria = assetConfig?.criteria || []
  const scoringFlags = assetConfig?.flags || []

  // Build chart data from facts
  const performanceData = facts ? [
    facts.irr_net != null && { label: 'Net IRR', value: parseFloat((facts.irr_net * 100).toFixed(1)) },
    facts.irr_gross != null && { label: 'Gross IRR', value: parseFloat((facts.irr_gross * 100).toFixed(1)) },
    facts.target_irr != null && { label: 'Target IRR', value: parseFloat((facts.target_irr * 100).toFixed(1)) },
  ].filter(Boolean) as { label: string; value: number }[] : []

  const multiplesData = facts ? [
    facts.tvpi != null && { label: 'TVPI', value: facts.tvpi },
    facts.dpi != null && { label: 'DPI', value: facts.dpi },
    facts.moic != null && { label: 'MOIC', value: facts.moic },
  ].filter(Boolean) as { label: string; value: number }[] : []

  const capitalData = facts ? [
    facts.fund_size_mm != null && { label: 'Fund Size', value: facts.fund_size_mm },
    facts.committed_capital_mm != null && { label: 'Committed', value: facts.committed_capital_mm },
    facts.called_capital_mm != null && { label: 'Called', value: facts.called_capital_mm },
  ].filter(Boolean) as { label: string; value: number }[] : []

  // Group criteria by bucket
  const buckets = ['returns', 'process', 'people'] as const

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back to list</button>
        <div style={S.titleRow}>
          <div>
            <div style={S.title}>{manager.fund_name}</div>
            <div style={S.subtitle}>{manager.manager_name} · {manager.asset_class}</div>
          </div>
          <div style={{
            padding: '6px 14px',
            background: currentStatus.bg,
            color: currentStatus.color,
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid ${currentStatus.color}`,
          }}>
            {currentStatus.label}
          </div>
        </div>

        {/* Pipeline status selector */}
        <div style={S.statusRow}>
          {PIPELINE_STATUSES.map(s => (
            <button
              key={s.id}
              onClick={() => setPipelineStatus(s.id)}
              style={S.statusBtn(pipelineStatus === s.id, s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      {facts && (
        <div style={S.statsGrid}>
          <div style={S.statCard}>
            <div style={S.statLabel}>Fund Size</div>
            <div style={S.statValue}>{fmt.mm(facts.fund_size_mm)}</div>
          </div>
          {facts.irr_net != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>Net IRR</div>
              <div style={{ ...S.statValue, color: facts.irr_net > 0 ? '#2D6A2D' : '#A02020' }}>
                {fmt.pct(facts.irr_net)}
              </div>
            </div>
          )}
          {facts.tvpi != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>TVPI</div>
              <div style={S.statValue}>{fmt.x(facts.tvpi)}</div>
            </div>
          )}
          {facts.dpi != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>DPI</div>
              <div style={S.statValue}>{fmt.x(facts.dpi)}</div>
            </div>
          )}
          {facts.moic != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>MOIC</div>
              <div style={S.statValue}>{fmt.x(facts.moic)}</div>
            </div>
          )}
          {facts.management_fee_pct != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>Mgmt Fee</div>
              <div style={S.statValue}>{fmt.pct(facts.management_fee_pct)}</div>
            </div>
          )}
          {facts.carry_pct != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>Carry</div>
              <div style={S.statValue}>{fmt.pct(facts.carry_pct)}</div>
            </div>
          )}
          {facts.gp_commitment_pct != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>GP Commit</div>
              <div style={S.statValue}>{fmt.pct(facts.gp_commitment_pct)}</div>
            </div>
          )}
          {facts.lock_up_months != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>Lock-up</div>
              <div style={S.statValue}>{fmt.mo(facts.lock_up_months)}</div>
            </div>
          )}
          {facts.hurdle_rate != null && (
            <div style={S.statCard}>
              <div style={S.statLabel}>Hurdle</div>
              <div style={S.statValue}>{fmt.pct(facts.hurdle_rate)}</div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={S.nav}>
        {['overview', 'scorecard', 'charts', 'documents', 'notes', 'cashflows'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={S.navBtn(activeTab === tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {facts ? (
            <div style={S.section}>
              <div style={S.sectionTitle}>Fund Information</div>
              <div style={S.grid2}>
                <div>
                  {facts.investment_strategy && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>Strategy</div>
                      <div style={S.value}>{facts.investment_strategy}</div>
                    </div>
                  )}
                  {facts.target_geographies?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>Geographies</div>
                      <div style={S.value}>{facts.target_geographies.join(', ')}</div>
                    </div>
                  )}
                  {facts.target_sectors?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>Sectors / Asset Types</div>
                      <div style={S.value}>{facts.target_sectors.join(', ')}</div>
                    </div>
                  )}
                </div>
                <div>
                  {facts.key_personnel?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>Key Personnel</div>
                      {facts.key_personnel.map((p: string, i: number) => (
                        <div key={i} style={{ ...S.value, marginBottom: 2 }}>• {p}</div>
                      ))}
                    </div>
                  )}
                  {facts.gp_team_size && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>Team Size</div>
                      <div style={S.value}>{facts.gp_team_size} people</div>
                    </div>
                  )}
                  {facts.style_drift_flags?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={S.label}>⚠️ Style Drift Flags</div>
                      {facts.style_drift_flags.map((f: string, i: number) => (
                        <div key={i} style={{ ...S.value, color: '#B8860B', marginBottom: 2 }}>• {f}</div>
                      ))}
                    </div>
                  )}
                  {facts.concentration_risks?.length > 0 && (
                    <div>
                      <div style={S.label}>⚠️ Concentration Risks</div>
                      {facts.concentration_risks.map((r: string, i: number) => (
                        <div key={i} style={{ ...S.value, color: '#A02020', marginBottom: 2 }}>• {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={S.section}>
              <div style={S.emptyState}>No fund data extracted yet. Upload a document to populate.</div>
            </div>
          )}
        </>
      )}

      {/* ── SCORECARD TAB ────────────────────────────────────────────────── */}
      {activeTab === 'scorecard' && (
        <>
          {/* Composite score */}
          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={S.sectionTitle}>AI Scorecard — {assetConfig?.label || manager.asset_class}</div>
              <button
                onClick={handleAiScore}
                disabled={aiScoring}
                style={{
                  padding: '6px 14px',
                  background: aiScoring ? '#ccc' : '#1A4A8A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: aiScoring ? 'not-allowed' : 'pointer',
                }}
              >
                {aiScoring ? '⏳ Scoring...' : '✦ AI Auto-Score'}
              </button>
            </div>

            {composite != null ? (
              <ScoreGauge score={composite} />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: 12 }}>
                Score criteria below or click AI Auto-Score to generate scores from uploaded documents
              </div>
            )}
          </div>

          {/* Scale guide */}
          <div style={{ ...S.section, padding: '10px 16px' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              {SCALE_GUIDE.map(s => (
                <div key={s.score} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, background:
                      s.score === 5 ? '#2D6A2D' : s.score === 4 ? '#4A8A4A' : s.score === 3 ? '#1A4A8A' : s.score === 2 ? '#B8860B' : '#A02020',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 10,
                  }}>{s.score}</div>
                  <span style={{ color: '#666' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Criteria by bucket */}
          <div style={S.section}>
            {buckets.map(bucket => {
              const bucketCriteria = scoringCriteria.filter(c => c.bucket === bucket)
              if (!bucketCriteria.length) return null
              const bucketLabel = assetConfig?.bucketLabels[bucket] || bucket
              return (
                <div key={bucket}>
                  <div style={S.bucketHeader}>{bucketLabel}</div>
                  {bucketCriteria.map(criterion => (
                    <div key={criterion.id} style={S.scoreRow}>
                      <div style={{ flex: 1 }}>
                        <div style={S.scoreLabel}>{criterion.label}</div>
                        <div style={S.scoreSub}>{criterion.what_to_look_for}</div>
                      </div>
                      <div style={S.scoreBtns}>
                        {[1, 2, 3, 4, 5].map(score => (
                          <button
                            key={score}
                            onClick={() => setScores(prev => ({
                              ...prev,
                              [criterion.id]: prev[criterion.id] === score ? null : score
                            }))}
                            style={S.scoreBtn(scores[criterion.id] === score, score)}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Red flags */}
          {scoringFlags.length > 0 && (
            <div style={S.section}>
              <div style={S.sectionTitle}>⚠️ Red Flags</div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Check any that apply — each triggers watch-list review</div>
              {scoringFlags.map(flag => (
                <div key={flag.id} style={S.flagRow}>
                  <input
                    type="checkbox"
                    checked={flags[flag.id] || false}
                    onChange={e => setFlags(prev => ({ ...prev, [flag.id]: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: flags[flag.id] ? '#A02020' : '#333' }}>{flag.label}</span>
                </div>
              ))}
              {Object.values(flags).some(Boolean) && (
                <div style={{ marginTop: 10, padding: 10, background: '#FDF0F0', borderRadius: 6, fontSize: 12, color: '#A02020' }}>
                  ⚠️ {Object.values(flags).filter(Boolean).length} flag(s) active — automatic watch-list review triggered
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── CHARTS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'charts' && (
        <>
          {facts ? (
            <div style={S.grid2}>
              {performanceData.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Return Metrics (%)</div>
                  <MiniBarChart data={performanceData} color="#1A4A8A" />
                </div>
              )}
              {multiplesData.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Multiples (x)</div>
                  <MiniBarChart data={multiplesData} color="#2D6A2D" />
                </div>
              )}
              {capitalData.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Capital ($M)</div>
                  <MiniBarChart data={capitalData} color="#6B7FA3" />
                </div>
              )}
              {cashflows.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Cash Flow Activity ($M)</div>
                  <MiniBarChart
                    data={cashflows.slice(0, 8).map((cf: any) => ({
                      label: cf.cashflow_type.slice(0, 8),
                      value: cf.cashflow_type === 'Capital Call' ? -cf.amount_mm : cf.amount_mm,
                    }))}
                    color="#B8860B"
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={S.section}>
              <div style={S.emptyState}>No data available for charts yet. Upload documents to populate.</div>
            </div>
          )}
        </>
      )}

      {/* ── DOCUMENTS TAB ────────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Uploaded Documents ({documents.length})</div>
          {documents.length === 0 ? (
            <div style={S.emptyState}>No documents uploaded yet</div>
          ) : (
            documents.map(doc => (
              <div key={doc.id} style={S.docItem}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.doc_name}</div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {new Date(doc.created_at).toLocaleDateString()} · {doc.file_size_kb}KB
                    {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={S.badge}>{doc.doc_type}</span>
                  <span style={{
                    ...S.badge,
                    color: doc.status === 'extracted' ? '#2D6A2D' : doc.status === 'failed' ? '#A02020' : '#B8860B',
                    background: doc.status === 'extracted' ? '#EDF7ED' : doc.status === 'failed' ? '#FDF0F0' : '#FDF8E6',
                  }}>{doc.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── NOTES TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Qualitative Notes</div>
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a note — why you like or dislike this opportunity, key concerns, follow-up items..."
            style={S.noteInput}
          />
          <button onClick={handleSaveNote} disabled={savingNote} style={S.saveBtn}>
            {savingNote ? 'Saving...' : 'Save Note'}
          </button>
          <div style={{ marginTop: 16 }}>
            {notes.length === 0 ? (
              <div style={S.emptyState}>No notes yet</div>
            ) : (
              notes.map(note => (
                <div key={note.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0eeea' }}>
                  <div style={{ fontSize: 10, color: '#1A4A8A', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase' as const }}>
                    {note.note_type} · {new Date(note.created_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>{note.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── CASHFLOWS TAB ────────────────────────────────────────────────── */}
      {activeTab === 'cashflows' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Capital Activity</div>
          {cashflows.length === 0 ? (
            <div style={S.emptyState}>No cash flows recorded yet</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {cashflows.map((cf: any) => (
                <div key={cf.id} style={S.statCard}>
                  <div style={S.statLabel}>{cf.cashflow_type}</div>
                  <div style={{
                    ...S.statValue,
                    color: cf.cashflow_type === 'Capital Call' ? '#A02020' : '#2D6A2D'
                  }}>
                    {cf.cashflow_type === 'Capital Call' ? '-' : '+'}{fmt.mm(cf.amount_mm)}
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                    {new Date(cf.cashflow_date).toLocaleDateString()}
                  </div>
                  {cf.description && <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{cf.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

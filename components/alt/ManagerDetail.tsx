// components/alt/ManagerDetail.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadDocs, loadFacts, loadNotes, loadCashflows, saveNote, loadScores, saveScores, updateManagerAssetClass } from '@/lib/supabase'
import { ALT_SCORING_CONFIG, getRecommendation, calcComposite, SCALE_GUIDE } from '@/lib/alt-scoring'

const PIPELINE_STATUSES = [
  { id: 'tracking', label: 'Tracking', color: '#6B7FA3', bg: '#EEF1F8' },
  { id: 'near_investing', label: 'Near Investing', color: '#B8860B', bg: '#FDF8E6' },
  { id: 'investing', label: 'Investing', color: '#2D6A2D', bg: '#EDF7ED' },
  { id: 'pass', label: 'Pass', color: '#999', bg: '#F5F4F1' },
]

const ASSET_CLASSES = [
  'Private Equity', 'Private Credit', 'Hedge Funds', 'Managed Futures',
  'Private Real Estate', 'Energy', 'Crypto Assets', 'Opportunistic', 'Research',
]

const SCORE_COLORS: Record<number, string> = {
  1: '#C0392B', 2: '#E67E22', 3: '#2980B9', 4: '#27AE60', 5: '#1E8449'
}

interface ManagerDetailProps {
  manager: any
  onBack: () => void
  onStatusChange: (id: string, status: string) => void
}

const navBtnStyle = (active: boolean): CSSProperties => ({
  fontSize: 12, padding: '0 16px', height: 40, border: 'none', background: 'transparent',
  cursor: 'pointer', color: active ? '#1C2B3A' : '#888',
  borderBottom: active ? '2px solid #0F1E2E' : '2px solid transparent',
  fontWeight: active ? 600 : 400, marginBottom: -1, letterSpacing: '-.01em',
})

const scoreBtnStyle = (active: boolean, score: number): CSSProperties => ({
  width: 34, height: 34, borderRadius: 6,
  border: `1.5px solid ${active ? SCORE_COLORS[score] : '#E0DED8'}`,
  background: active ? SCORE_COLORS[score] : '#fff',
  color: active ? '#fff' : '#aaa',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  transition: 'all .1s',
})

function MiniBar({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 90, fontSize: 11, color: '#666', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, background: '#F0EEE8', borderRadius: 3, height: 18, overflow: 'hidden' }}>
            <div style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: d.value < 0 ? '#C0392B' : color, height: '100%', borderRadius: 3, transition: 'width .5s ease' }} />
          </div>
          <div style={{ width: 52, fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: d.value < 0 ? '#C0392B' : '#1C2B3A' }}>{d.value}</div>
        </div>
      ))}
    </div>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const pct = ((score - 1) / 4) * 100
  const rec = getRecommendation(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 0' }}>
      <div style={{ textAlign: 'center', minWidth: 100 }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: rec.color, fontFamily: 'monospace', lineHeight: 1 }}>{score.toFixed(2)}</div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>out of 5.00</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ background: '#F0EEE8', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${pct}%`, background: rec.color, height: '100%', borderRadius: 6, transition: 'width .6s ease' }} />
        </div>
        <div style={{ display: 'inline-block', padding: '5px 14px', background: rec.color + '18', color: rec.color, borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${rec.color}33`, marginBottom: 6 }}>
          {rec.label}
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>{rec.action}</div>
      </div>
    </div>
  )
}

export default function ManagerDetail({ manager, onBack, onStatusChange }: ManagerDetailProps) {
  const [documents, setDocuments] = useState<any[]>([])
  const [facts, setFacts] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [cashflows, setCashflows] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [pipelineStatus, setPipelineStatus] = useState(manager.pipeline_status || 'tracking')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [flagReasons, setFlagReasons] = useState<Record<string, string | null>>({})
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [aiScoring, setAiScoring] = useState(false)
  const [savingScores, setSavingScores] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [currentAssetClass, setCurrentAssetClass] = useState(manager.asset_class)

  const assetConfig = ALT_SCORING_CONFIG[currentAssetClass] || ALT_SCORING_CONFIG['Private Equity']
  const composite = calcComposite(scores)
  const currentStatus = PIPELINE_STATUSES.find(s => s.id === pipelineStatus) || PIPELINE_STATUSES[0]

  const fmt = {
    pct: (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(2)}%`,
    mm: (v: number | null) => v == null ? '—' : `$${v}M`,
    x: (v: number | null) => v == null ? '—' : `${v.toFixed(2)}x`,
    mo: (v: number | null) => v == null ? '—' : `${v}mo`,
  }

  useEffect(() => { loadData() }, [manager.id])

  async function loadData() {
    setLoading(true)
    try {
      const [docsRes, factsRes, notesRes, cfRes, scoresRes] = await Promise.all([
        loadDocs(manager.id), loadFacts(manager.id), loadNotes(manager.id),
        loadCashflows(manager.id), loadScores(manager.id),
      ])
      if (docsRes.data) setDocuments(docsRes.data)
      if (factsRes.data?.length) setFacts(factsRes.data[0])
      if (notesRes.data) setNotes(notesRes.data)
      if (cfRes.data) setCashflows(cfRes.data)
      if (scoresRes.data) {
        setScores(scoresRes.data.scores || {})
        setFlags(scoresRes.data.flags || {})
        setFlagReasons(scoresRes.data.flag_reasons || {})
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleAiScore() {
    setAiScoring(true)
    try {
      const res = await fetch('/api/alt/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: manager.id, assetClass: currentAssetClass }),
      })
      const data = await res.json()
      if (data.scores) {
        setScores(data.scores)
        setFlags(data.flags || {})
        setFlagReasons(data.flag_reasons || {})
        // Auto-save
        const comp = calcComposite(data.scores)
        const rec = comp ? getRecommendation(comp) : null
        await saveScores(manager.id, data.scores, data.flags || {}, data.flag_reasons || {}, comp, rec?.label || null)
      }
    } catch (err) { console.error(err) }
    finally { setAiScoring(false) }
  }

  async function handleSaveScores() {
    setSavingScores(true)
    try {
      const rec = composite ? getRecommendation(composite) : null
      await saveScores(manager.id, scores, flags, flagReasons, composite, rec?.label || null)
    } catch (err) { console.error(err) }
    finally { setSavingScores(false) }
  }

  async function handleSaveNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await saveNote({ manager_id: manager.id, note_type: 'general', content: newNote })
      setNewNote('')
      const { data } = await loadNotes(manager.id)
      if (data) setNotes(data)
    } catch (err) { console.error(err) }
    finally { setSavingNote(false) }
  }

  async function handleStatusChange(newStatus: string) {
    setPipelineStatus(newStatus)
    onStatusChange(manager.id, newStatus)
  }

  async function handleReassign(newAssetClass: string) {
    await updateManagerAssetClass(manager.id, newAssetClass)
    setCurrentAssetClass(newAssetClass)
    setShowReassign(false)
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa' }}>Loading...</div>
  )

  const scoringCriteria = assetConfig?.criteria || []
  const scoringFlags = assetConfig?.flags || []
  const buckets = ['returns', 'process', 'people'] as const

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

  const section: CSSProperties = { background: '#fff', border: '1px solid #E8E6E0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }
  const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#1C2B3A', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #F0EEE8', textTransform: 'uppercase', letterSpacing: '.06em' }
  const statCard: CSSProperties = { background: '#FAFAF8', border: '1px solid #F0EEE8', borderRadius: 8, padding: '10px 14px' }
  const statLabel: CSSProperties = { fontSize: 9, color: '#aaa', textTransform: 'uppercase', marginBottom: 5, fontFamily: 'monospace', letterSpacing: '.07em' }
  const statValue: CSSProperties = { fontSize: 18, fontWeight: 700, color: '#1C2B3A', fontFamily: 'monospace', letterSpacing: '-.02em' }
  const infoLabel: CSSProperties = { fontSize: 10, color: '#aaa', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'monospace', letterSpacing: '.05em' }
  const infoValue: CSSProperties = { fontSize: 13, color: '#333', lineHeight: 1.6 }
  const emptyState: CSSProperties = { textAlign: 'center', padding: '40px 20px', color: '#bbb', fontSize: 12 }
  const scoreRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, padding: '12px 14px', background: '#FAFAF8', borderRadius: 8, border: '1px solid #F0EEE8' }
  const bucketHeader: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#4A9EE7', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, marginTop: 20, paddingBottom: 6, borderBottom: '2px solid #EEF5FD' }
  const noteInput: CSSProperties = { width: '100%', padding: '12px', border: '1px solid #E0DED8', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90, boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit', lineHeight: 1.6, color: '#333' }
  const badge: CSSProperties = { fontSize: 10, color: '#888', fontFamily: 'monospace', background: '#F0EEE8', padding: '2px 8px', borderRadius: 4 }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F1E2E', letterSpacing: '-.03em', marginBottom: 4 }}>{manager.fund_name}</div>
            <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{manager.manager_name} · {currentAssetClass}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Reassign */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowReassign(!showReassign)} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #E0DED8', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#666', fontWeight: 500 }}>
                Move ▾
              </button>
              {showReassign && (
                <div style={{ position: 'absolute', right: 0, top: 36, background: '#fff', border: '1px solid #E0DED8', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 190, overflow: 'hidden' }}>
                  {ASSET_CLASSES.map(ac => (
                    <button key={ac} onClick={() => handleReassign(ac)} style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: ac === currentAssetClass ? '#EEF5FD' : '#fff', color: ac === currentAssetClass ? '#4A9EE7' : '#333', border: 'none', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #F5F4F0', fontWeight: ac === currentAssetClass ? 600 : 400 }}>
                      {ac === currentAssetClass ? '✓ ' : ''}{ac}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Status badge */}
            <div style={{ padding: '6px 14px', background: currentStatus.bg, color: currentStatus.color, borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${currentStatus.color}44`, letterSpacing: '-.01em' }}>
              {currentStatus.label}
            </div>
          </div>
        </div>

        {/* Pipeline selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {PIPELINE_STATUSES.map(s => (
            <button key={s.id} onClick={() => handleStatusChange(s.id)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: pipelineStatus === s.id ? 700 : 400, border: `1px solid ${pipelineStatus === s.id ? s.color : '#E0DED8'}`, background: pipelineStatus === s.id ? s.bg : '#fff', color: pipelineStatus === s.id ? s.color : '#888', letterSpacing: '-.01em' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {facts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
          {facts.fund_size_mm != null && <div style={statCard}><div style={statLabel}>Fund Size</div><div style={statValue}>{fmt.mm(facts.fund_size_mm)}</div></div>}
          {facts.irr_net != null && <div style={statCard}><div style={statLabel}>Net IRR</div><div style={{ ...statValue, color: facts.irr_net > 0 ? '#27AE60' : '#C0392B' }}>{fmt.pct(facts.irr_net)}</div></div>}
          {facts.irr_gross != null && <div style={statCard}><div style={statLabel}>Gross IRR</div><div style={statValue}>{fmt.pct(facts.irr_gross)}</div></div>}
          {facts.tvpi != null && <div style={statCard}><div style={statLabel}>TVPI</div><div style={statValue}>{fmt.x(facts.tvpi)}</div></div>}
          {facts.dpi != null && <div style={statCard}><div style={statLabel}>DPI</div><div style={statValue}>{fmt.x(facts.dpi)}</div></div>}
          {facts.moic != null && <div style={statCard}><div style={statLabel}>MOIC</div><div style={statValue}>{fmt.x(facts.moic)}</div></div>}
          {facts.management_fee_pct != null && <div style={statCard}><div style={statLabel}>Mgmt Fee</div><div style={statValue}>{fmt.pct(facts.management_fee_pct)}</div></div>}
          {facts.carry_pct != null && <div style={statCard}><div style={statLabel}>Carry</div><div style={statValue}>{fmt.pct(facts.carry_pct)}</div></div>}
          {facts.gp_commitment_pct != null && <div style={statCard}><div style={statLabel}>GP Commit</div><div style={statValue}>{fmt.pct(facts.gp_commitment_pct)}</div></div>}
          {facts.hurdle_rate != null && <div style={statCard}><div style={statLabel}>Hurdle</div><div style={statValue}>{fmt.pct(facts.hurdle_rate)}</div></div>}
          {facts.lock_up_months != null && <div style={statCard}><div style={statLabel}>Lock-up</div><div style={statValue}>{fmt.mo(facts.lock_up_months)}</div></div>}
        </div>
      )}

      {/* Score summary if exists */}
      {composite != null && (
        <div style={{ ...section, borderLeft: `4px solid ${getRecommendation(composite).color}`, marginBottom: 16 }}>
          <ScoreGauge score={composite} />
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E6E0', marginBottom: 20, background: '#fff', borderRadius: '10px 10px 0 0', overflow: 'hidden', border: '1px solid #E8E6E0' }}>
        {['overview', 'scorecard', 'charts', 'documents', 'notes', 'cashflows'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={navBtnStyle(activeTab === tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={section}>
          <div style={sectionTitle}>Fund Information</div>
          {facts ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                {facts.investment_strategy && <div style={{ marginBottom: 16 }}><div style={infoLabel}>Strategy</div><div style={infoValue}>{facts.investment_strategy}</div></div>}
                {facts.target_geographies?.length > 0 && <div style={{ marginBottom: 16 }}><div style={infoLabel}>Geographies</div><div style={infoValue}>{facts.target_geographies.join(', ')}</div></div>}
                {facts.target_sectors?.length > 0 && <div style={{ marginBottom: 16 }}><div style={infoLabel}>Sectors</div><div style={infoValue}>{facts.target_sectors.join(', ')}</div></div>}
              </div>
              <div>
                {facts.key_personnel?.length > 0 && <div style={{ marginBottom: 16 }}><div style={infoLabel}>Key Personnel</div>{facts.key_personnel.map((p: string, i: number) => <div key={i} style={{ ...infoValue, marginBottom: 3 }}>· {p}</div>)}</div>}
                {facts.style_drift_flags?.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ ...infoLabel, color: '#E67E22' }}>⚠ Style Drift</div>{facts.style_drift_flags.map((f: string, i: number) => <div key={i} style={{ ...infoValue, color: '#E67E22', fontSize: 12 }}>· {f}</div>)}</div>}
                {facts.concentration_risks?.length > 0 && <div><div style={{ ...infoLabel, color: '#C0392B' }}>⚠ Concentration Risks</div>{facts.concentration_risks.map((r: string, i: number) => <div key={i} style={{ ...infoValue, color: '#C0392B', fontSize: 12 }}>· {r}</div>)}</div>}
              </div>
            </div>
          ) : <div style={emptyState}>No fund data extracted yet. Upload a document.</div>}
        </div>
      )}

      {/* SCORECARD */}
      {activeTab === 'scorecard' && (
        <>
          <div style={section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={sectionTitle}>AI Scorecard — {assetConfig?.label}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveScores} disabled={savingScores || !composite} style={{ padding: '6px 14px', background: savingScores || !composite ? '#ccc' : '#0F1E2E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: savingScores || !composite ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                  {savingScores ? 'Saving...' : '↓ Save Scores'}
                </button>
                <button onClick={handleAiScore} disabled={aiScoring} style={{ padding: '6px 14px', background: aiScoring ? '#ccc' : '#4A9EE7', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: aiScoring ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                  {aiScoring ? '⏳ Scoring...' : '✦ AI Auto-Score'}
                </button>
              </div>
            </div>
            {composite != null ? <ScoreGauge score={composite} /> : <div style={emptyState}>Score criteria below or click AI Auto-Score</div>}
          </div>

          {/* Scale */}
          <div style={{ ...section, padding: '12px 20px' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {SCALE_GUIDE.map(s => (
                <div key={s.score} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: SCORE_COLORS[s.score], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11 }}>{s.score}</div>
                  <span style={{ color: '#555', fontWeight: 500 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Criteria */}
          <div style={section}>
            {buckets.map(bucket => {
              const bucketCriteria = scoringCriteria.filter(c => c.bucket === bucket)
              if (!bucketCriteria.length) return null
              return (
                <div key={bucket}>
                  <div style={bucketHeader}>{assetConfig?.bucketLabels[bucket] || bucket}</div>
                  {bucketCriteria.map(criterion => (
                    <div key={criterion.id} style={scoreRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2B3A', marginBottom: 3, letterSpacing: '-.01em' }}>{criterion.label}</div>
                        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>{criterion.what_to_look_for}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {[1, 2, 3, 4, 5].map(score => (
                          <button key={score} onClick={() => setScores(prev => ({ ...prev, [criterion.id]: prev[criterion.id] === score ? null : score }))} style={scoreBtnStyle(scores[criterion.id] === score, score)}>
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
            <div style={section}>
              <div style={sectionTitle}>⚠ Red Flags</div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 14 }}>Auto-checked by AI — override manually if needed</div>
              {scoringFlags.map(flag => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, padding: '10px 12px', background: flags[flag.id] ? '#FDF5F3' : '#FAFAF8', borderRadius: 7, border: `1px solid ${flags[flag.id] ? '#E8B4A8' : '#F0EEE8'}` }}>
                  <input type="checkbox" checked={flags[flag.id] || false} onChange={e => setFlags(prev => ({ ...prev, [flag.id]: e.target.checked }))} style={{ width: 15, height: 15, cursor: 'pointer', marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: flags[flag.id] ? '#C0392B' : '#333', fontWeight: flags[flag.id] ? 600 : 400 }}>{flag.label}</div>
                    {flagReasons[flag.id] && <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{flagReasons[flag.id]}</div>}
                  </div>
                </div>
              ))}
              {Object.values(flags).some(Boolean) && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#FDF0F0', borderRadius: 7, fontSize: 12, color: '#C0392B', fontWeight: 500, border: '1px solid #F0C0B0' }}>
                  ⚠ {Object.values(flags).filter(Boolean).length} flag(s) active — watch-list review triggered
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CHARTS */}
      {activeTab === 'charts' && (
        facts ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {performanceData.length > 0 && <div style={section}><div style={sectionTitle}>Return Metrics (%)</div><MiniBar data={performanceData} color="#2980B9" /></div>}
            {multiplesData.length > 0 && <div style={section}><div style={sectionTitle}>Multiples (x)</div><MiniBar data={multiplesData} color="#27AE60" /></div>}
            {capitalData.length > 0 && <div style={section}><div style={sectionTitle}>Capital ($M)</div><MiniBar data={capitalData} color="#6B7FA3" /></div>}
          </div>
        ) : <div style={section}><div style={emptyState}>No data for charts yet. Upload documents to populate.</div></div>
      )}

      {/* DOCUMENTS */}
      {activeTab === 'documents' && (
        <div style={section}>
          <div style={sectionTitle}>Uploaded Documents ({documents.length})</div>
          {documents.length === 0 ? <div style={emptyState}>No documents uploaded yet</div> : documents.map(doc => (
            <div key={doc.id} style={{ background: '#FAFAF8', border: '1px solid #F0EEE8', borderRadius: 7, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2B3A', marginBottom: 3 }}>{doc.doc_name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(doc.created_at).toLocaleDateString()} · {doc.file_size_kb}KB{doc.page_count ? ` · ${doc.page_count} pages` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={badge}>{doc.doc_type}</span>
                <span style={{ ...badge, color: doc.status === 'extracted' ? '#27AE60' : '#C0392B', background: doc.status === 'extracted' ? '#EDF7ED' : '#FDF0F0' }}>{doc.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NOTES */}
      {activeTab === 'notes' && (
        <div style={section}>
          <div style={sectionTitle}>Qualitative Notes</div>
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note — investment thesis, concerns, follow-up items, GP conversation notes..." style={noteInput} />
          <button onClick={handleSaveNote} disabled={savingNote} style={{ padding: '8px 18px', background: savingNote ? '#ccc' : '#0F1E2E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: savingNote ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            {savingNote ? 'Saving...' : 'Save Note'}
          </button>
          <div style={{ marginTop: 20 }}>
            {notes.length === 0 ? <div style={emptyState}>No notes yet</div> : notes.map(note => (
              <div key={note.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #F0EEE8' }}>
                <div style={{ fontSize: 10, color: '#4A9EE7', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {note.note_type} · {new Date(note.created_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.7 }}>{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CASHFLOWS */}
      {activeTab === 'cashflows' && (
        <div style={section}>
          <div style={sectionTitle}>Capital Activity</div>
          {cashflows.length === 0 ? <div style={emptyState}>No cash flows recorded yet</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {cashflows.map((cf: any) => (
                <div key={cf.id} style={statCard}>
                  <div style={statLabel}>{cf.cashflow_type}</div>
                  <div style={{ ...statValue, fontSize: 16, color: cf.cashflow_type === 'Capital Call' ? '#C0392B' : '#27AE60' }}>
                    {cf.cashflow_type === 'Capital Call' ? '-' : '+'}{fmt.mm(cf.amount_mm)}
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 5 }}>{new Date(cf.cashflow_date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

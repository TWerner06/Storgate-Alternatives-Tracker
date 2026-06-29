// components/AltTracker.tsx
'use client'

import { useState, useEffect, useRef, CSSProperties } from 'react'
import { loadManagers, updateManagerStatus, loadScores } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'
import AiAssistant from './alt/AiAssistant'
import Dashboard from './alt/Dashboard'
import MarketResearch from './alt/MarketResearch'

const ASSET_CLASSES = [
  { id: 'Private Equity', icon: '◈' },
  { id: 'Private Credit', icon: '◆' },
  { id: 'Hedge Funds', icon: '◇' },
  { id: 'Managed Futures', icon: '▲' },
  { id: 'Private Real Estate', icon: '⬡' },
  { id: 'Energy', icon: '◉' },
  { id: 'Crypto Assets', icon: '◎' },
  { id: 'Opportunistic', icon: '◐' },
]

const PIPELINE_STAGES = [
  { id: 'tracking',       label: 'Tracking',       color: '#94A3B8', bg: '#F1F5F9' },
  { id: 'near_investing', label: 'Near Investing',  color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'investing',      label: 'Investing',       color: '#10B981', bg: '#ECFDF5' },
  { id: 'pass',           label: 'Pass',            color: '#EF4444', bg: '#FEF2F2' },
]

const T = {
  navy: '#0B1929', navyLight: '#132338', navyBorder: 'rgba(255,255,255,0.07)',
  blue: '#3B82F6', blueLight: '#EFF6FF', blueMid: '#93C5FD',
  green: '#10B981', amber: '#F59E0B', red: '#EF4444', slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

type MainView = 'dashboard' | 'list' | 'detail' | 'upload' | 'ai' | 'market_research'

// ── Global Search Component ────────────────────────────────────────────────────
function GlobalSearch({ managers, scores, onSelect, onClose }: {
  managers: any[]
  scores: Record<string, any>
  onSelect: (m: any) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [assetFilter, setAssetFilter] = useState<string>('')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(0)
  const [maxScore, setMaxScore] = useState<number>(5)
  const [minIRR, setMinIRR] = useState<number>(0)
  const [maxFee, setMaxFee] = useState<number>(100)
  const [minFundSize, setMinFundSize] = useState<number>(0)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [stage2Only, setStage2Only] = useState(false)
  const [scoredOnly, setScoredOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const stageConfig: Record<string, { color: string; label: string; bg: string }> = {
    tracking:       { color: T.slate, label: 'Tracking',      bg: '#F1F5F9' },
    near_investing: { color: T.amber, label: 'Near Investing', bg: '#FFFBEB' },
    investing:      { color: T.green, label: 'Investing',      bg: '#ECFDF5' },
    pass:           { color: T.red,   label: 'Pass',           bg: '#FEF2F2' },
  }

  const activeFilterCount = [
    assetFilter, stageFilter,
    minScore > 0, maxScore < 5,
    minIRR > 0, maxFee < 100,
    minFundSize > 0,
    flaggedOnly, stage2Only, scoredOnly,
  ].filter(Boolean).length

  const clearAll = () => {
    setAssetFilter(''); setStageFilter('')
    setMinScore(0); setMaxScore(5)
    setMinIRR(0); setMaxFee(100)
    setMinFundSize(0)
    setFlaggedOnly(false); setStage2Only(false); setScoredOnly(false)
  }

  const results = managers.filter(m => {
    const q = query.toLowerCase()
    const score = scores[m.id]?.composite_score ?? null
    const facts = scores[m.id]?.facts || null
    const netIRR = m.irr_net != null ? m.irr_net * 100 : null
    const fee = m.management_fee_pct != null ? m.management_fee_pct * 100 : null
    const fundSize = m.fund_size_mm ?? null
    const hasFlags = scores[m.id]?.flags && Object.values(scores[m.id].flags).some(Boolean)
    const isStage2 = m.stage2_unlocked || false
    const isScored = score != null

    if (q && !m.fund_name?.toLowerCase().includes(q) && !m.manager_name?.toLowerCase().includes(q) && !m.asset_class?.toLowerCase().includes(q)) return false
    if (assetFilter && m.asset_class !== assetFilter) return false
    if (stageFilter && m.pipeline_status !== stageFilter) return false
    if (scoredOnly && !isScored) return false
    if (score != null && score < minScore) return false
    if (score != null && score > maxScore) return false
    if (flaggedOnly && !hasFlags) return false
    if (stage2Only && !isStage2) return false
    if (netIRR != null && netIRR < minIRR) return false
    if (fee != null && fee > maxFee) return false
    if (fundSize != null && fundSize < minFundSize) return false
    return true
  }).slice(0, 30)

  const pill = (label: string, active: boolean, onClick: () => void, color = T.blue, bg = T.blueLight) => (
    <button key={label} onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? color : T.border}`,
      background: active ? bg : T.surface,
      color: active ? color : T.textMid,
      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: T.sans,
    }}>{label}</button>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', paddingTop: 60,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 680, background: T.surface, borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
        border: `1px solid ${T.border}`, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 16, color: T.textLight }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search funds, GPs, asset classes..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: T.sans, color: T.text, background: 'transparent' }}
          />
          {query && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.textLight, fontSize: 16 }}>✕</button>}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${showFilters || activeFilterCount > 0 ? T.blue : T.border}`,
              background: showFilters || activeFilterCount > 0 ? T.blueLight : T.bg,
              color: showFilters || activeFilterCount > 0 ? T.blue : T.textMid,
              fontFamily: T.sans,
            }}
          >
            ⚙ Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
          <kbd style={{ fontSize: 10, color: T.textLight, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 6px' }}>ESC</kbd>
        </div>

        {/* Asset class + stage quick pills */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: `1px solid ${T.border}`, background: T.bg, overflowX: 'auto', flexShrink: 0 }}>
          {['Private Equity','Private Credit','Hedge Funds','Managed Futures','Private Real Estate','Energy','Crypto Assets','Opportunistic'].map(ac =>
            pill(ac.replace('Private ', '').replace(' Assets', ''), assetFilter === ac, () => setAssetFilter(assetFilter === ac ? '' : ac))
          )}
          <div style={{ width: 1, background: T.border, flexShrink: 0, margin: '0 4px' }} />
          {PIPELINE_STAGES.map(s =>
            pill(s.label, stageFilter === s.id, () => setStageFilter(stageFilter === s.id ? '' : s.id), s.color, s.bg)
          )}
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, background: '#FAFBFD', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.06em' }}>Advanced Filters</span>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} style={{ fontSize: 11, color: T.red, background: '#FEF2F2', border: `1px solid ${T.red}33`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

              {/* Score range */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>
                  Score: {minScore.toFixed(1)} — {maxScore.toFixed(1)}
                </div>
                <input type="range" min={0} max={5} step={0.1} value={minScore}
                  onChange={e => setMinScore(parseFloat(e.target.value))}
                  style={{ width: '100%', marginBottom: 4 }} />
                <input type="range" min={0} max={5} step={0.1} value={maxScore}
                  onChange={e => setMaxScore(parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>

              {/* Net IRR min */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>
                  Min Net IRR: {minIRR}%
                </div>
                <input type="range" min={0} max={50} step={1} value={minIRR}
                  onChange={e => setMinIRR(parseFloat(e.target.value))}
                  style={{ width: '100%', marginBottom: 4 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 10, 15, 20, 25].map(v => (
                    <button key={v} onClick={() => setMinIRR(v)} style={{
                      flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 4, fontWeight: 600,
                      background: minIRR === v ? T.blue : T.bg,
                      color: minIRR === v ? '#fff' : T.textMid,
                      border: `1px solid ${minIRR === v ? T.blue : T.border}`,
                    }}>{v}%</button>
                  ))}
                </div>
              </div>

              {/* Max fee */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>
                  Max Mgmt Fee: {maxFee >= 100 ? 'Any' : `${maxFee}%`}
                </div>
                <input type="range" min={0} max={5} step={0.25} value={Math.min(maxFee, 5)}
                  onChange={e => setMaxFee(parseFloat(e.target.value))}
                  style={{ width: '100%', marginBottom: 4 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['Any', 100], ['≤1%', 1], ['≤1.5%', 1.5], ['≤2%', 2]].map(([label, val]) => (
                    <button key={String(label)} onClick={() => setMaxFee(Number(val))} style={{
                      flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 4, fontWeight: 600,
                      background: maxFee === Number(val) ? T.blue : T.bg,
                      color: maxFee === Number(val) ? '#fff' : T.textMid,
                      border: `1px solid ${maxFee === Number(val) ? T.blue : T.border}`,
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Fund size min */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>
                  Min Fund Size: {minFundSize > 0 ? `$${minFundSize}M` : 'Any'}
                </div>
                <input type="range" min={0} max={5000} step={50} value={minFundSize}
                  onChange={e => setMinFundSize(parseFloat(e.target.value))}
                  style={{ width: '100%', marginBottom: 4 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['Any', 0], ['$100M+', 100], ['$500M+', 500], ['$1B+', 1000]].map(([label, val]) => (
                    <button key={String(label)} onClick={() => setMinFundSize(Number(val))} style={{
                      flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 4, fontWeight: 600,
                      background: minFundSize === Number(val) ? T.blue : T.bg,
                      color: minFundSize === Number(val) ? '#fff' : T.textMid,
                      border: `1px solid ${minFundSize === Number(val) ? T.blue : T.border}`,
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Toggle filters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 2 }}>Quick Toggles</div>
                {[
                  ['Scored funds only', scoredOnly, () => setScoredOnly(!scoredOnly)],
                  ['Stage 2 unlocked', stage2Only, () => setStage2Only(!stage2Only)],
                  ['Has red flags', flaggedOnly, () => setFlaggedOnly(!flaggedOnly)],
                ].map(([label, active, toggle]) => (
                  <label key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: T.text }}>
                    <input
                      type="checkbox"
                      checked={active as boolean}
                      onChange={toggle as any}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: T.blue }}
                    />
                    {String(label)}
                  </label>
                ))}
              </div>

              {/* Sort */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>Sort by</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    ['Score (High→Low)', 'score_desc'],
                    ['Score (Low→High)', 'score_asc'],
                    ['Fund Name A→Z', 'name_asc'],
                    ['Fund Size', 'size_desc'],
                  ].map(([label]) => (
                    <div key={String(label)} style={{ fontSize: 11, color: T.textLight }}>— {label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: T.textLight, fontSize: 13 }}>
              No funds match your filters
            </div>
          ) : results.map(m => {
            const score = scores[m.id]?.composite_score
            const stage = stageConfig[m.pipeline_status] || stageConfig.tracking
            const hasFlags = scores[m.id]?.flags && Object.values(scores[m.id].flags).some(Boolean)
            const isStage2 = m.stage2_unlocked || false
            const netIRR = m.irr_net != null ? `${(m.irr_net * 100).toFixed(1)}%` : null
            const fee = m.management_fee_pct != null ? `${(m.management_fee_pct * 100).toFixed(2)}%` : null
            const fundSize = m.fund_size_mm != null ? `$${m.fund_size_mm}M` : null

            return (
              <div
                key={m.id}
                onClick={() => { onSelect(m); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 18px', cursor: 'pointer',
                  borderBottom: `1px solid ${T.border}`, transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Score badge */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: !score ? T.bg : score >= 4 ? '#ECFDF5' : score >= 3 ? T.blueLight : '#FFFBEB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, fontFamily: T.mono,
                  color: !score ? T.textLight : score >= 4 ? T.green : score >= 3 ? T.blue : T.amber,
                }}>
                  {score ? score.toFixed(1) : '—'}
                </div>

                {/* Fund info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.fund_name}
                    </span>
                    {hasFlags && <span style={{ fontSize: 10, color: T.red, fontWeight: 700, flexShrink: 0 }}>⚠ Flag</span>}
                    {isStage2 && <span style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700, flexShrink: 0 }}>★ S2</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: T.textLight }}>
                    <span>{m.manager_name}</span>
                    {netIRR && <span>· IRR {netIRR}</span>}
                    {fee && <span>· Fee {fee}</span>}
                    {fundSize && <span>· {fundSize}</span>}
                  </div>
                </div>

                {/* Asset class tag */}
                <span style={{ fontSize: 10, color: T.textLight, background: T.bg, padding: '2px 8px', borderRadius: 5, fontFamily: T.mono, flexShrink: 0 }}>
                  {m.asset_class?.replace('Private ', '')}
                </span>

                {/* Stage badge */}
                <div style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  color: stage.color, background: stage.bg,
                  border: `1px solid ${stage.color}33`, flexShrink: 0, fontFamily: T.sans,
                }}>
                  {stage.label}
                </div>

                <span style={{ color: T.textLight, fontSize: 16 }}>→</span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px', background: T.bg, borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textLight, flexShrink: 0,
        }}>
          <span>{results.length} fund{results.length !== 1 ? 's' : ''} {activeFilterCount > 0 || query ? 'matched' : 'total'}</span>
          <span>Click to open · ESC to close</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AltTracker() {
  const [managers, setManagers] = useState<any[]>([])
  const [scores, setScores] = useState<Record<string, any>>({})
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [view, setView] = useState<MainView>('dashboard')
  const [viewMode, setViewMode] = useState<'asset' | 'pipeline'>('asset')
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadAll() }, [])

  // Cmd+K to open search
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data } = await loadManagers()
      const mgrs = data || []
      setManagers(mgrs)
      const scoreMap: Record<string, any> = {}
      await Promise.all(mgrs.map(async m => {
        const { data: s } = await loadScores(m.id)
        if (s) scoreMap[m.id] = s
      }))
      setScores(scoreMap)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleSelect = (m: any) => { setSelectedManager(m); setView('detail') }
  const handleUploadDone = () => { loadAll(); setView('list') }
  const handleStatusChange = async (id: string, status: string) => {
    await updateManagerStatus(id, status)
    setManagers(prev => prev.map(m => m.id === id ? { ...m, pipeline_status: status } : m))
  }

  const filtered = managers.filter(m => m.asset_class === selectedAssetClass)
  const countByClass = (ac: string) => managers.filter(m => m.asset_class === ac).length
  const countByStage = (s: string) => managers.filter(m => m.pipeline_status === s).length
  const SW = collapsed ? 58 : 220

  const navItem = (active: boolean, onClick: () => void, icon: string, label: string, badge?: number) => (
    <button key={label} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: collapsed ? '9px 0' : '9px 14px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      width: '100%', border: 'none', cursor: 'pointer',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      borderLeft: active ? `2px solid ${T.blue}` : '2px solid transparent',
      marginBottom: 1, transition: 'all .1s',
    }}>
      <span style={{ fontSize: 13, color: active ? T.blue : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{icon}</span>
      {!collapsed && <>
        <span style={{ fontSize: 12, color: active ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: active ? 600 : 400, flex: 1, textAlign: 'left', fontFamily: T.sans }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: active ? T.blue : 'rgba(255,255,255,0.25)', fontFamily: T.mono, background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8, minWidth: 20, textAlign: 'center' }}>
          {badge ?? 0}
        </span>
      </>}
    </button>
  )

  function KanbanBoard() {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {PIPELINE_STAGES.map(s => (
            <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.mono }}>{countByStage(s.id)}</div>
              <div style={{ fontSize: 11, color: T.textMid, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {PIPELINE_STAGES.map(stage => {
            const funds = managers.filter(m => m.pipeline_status === stage.id)
            return (
              <div key={stage.id} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{stage.label}</span>
                  </div>
                  <span style={{ fontSize: 11, color: T.textLight, fontFamily: T.mono, fontWeight: 700 }}>{funds.length}</span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
                  {funds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: T.textLight, fontSize: 11 }}>No funds</div>
                  ) : funds.map(m => {
                    const score = scores[m.id]?.composite_score
                    return (
                      <div key={m.id} onClick={() => handleSelect(m)}
                        style={{ background: '#FAFBFC', border: `1px solid ${T.border}`, borderRadius: 7, padding: '10px 11px', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.background = T.blueLight }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = '#FAFBFC' }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>{m.fund_name}</div>
                        <div style={{ fontSize: 11, color: T.textMid, marginBottom: 7 }}>{m.manager_name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: T.textLight, background: T.bg, padding: '2px 7px', borderRadius: 4, fontFamily: T.mono }}>{m.asset_class}</span>
                          {score && <span style={{ fontSize: 11, fontWeight: 700, color: score >= 4 ? T.green : score >= 3 ? T.blue : T.amber, fontFamily: T.mono }}>{score.toFixed(2)} ★</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 7 }} onClick={e => e.stopPropagation()}>
                          {PIPELINE_STAGES.filter(s => s.id !== stage.id).map(s => (
                            <button key={s.id} onClick={() => handleStatusChange(m.id, s.id)}
                              style={{ flex: 1, padding: '3px 0', fontSize: 9, background: '#fff', border: `1px solid ${s.color}44`, color: s.color, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                              {s.label.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function TopBar() {
    return (
      <div style={{ height: 50, background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMid }}>
          {(view === 'detail' || view === 'upload' || view === 'ai') && (
            <><span onClick={() => setView('dashboard')} style={{ color: T.blue, cursor: 'pointer', fontWeight: 500 }}>Home</span><span style={{ color: T.textLight }}>/</span></>
          )}
          <span style={{ fontWeight: 600, color: T.text }}>
            {view === 'detail' ? selectedManager?.fund_name : view === 'upload' ? 'Upload Document' : view === 'ai' ? 'AI Assistant' : view === 'dashboard' ? 'Dashboard' : viewMode === 'pipeline' ? 'Pipeline' : selectedAssetClass}
          </span>
        </div>
        {view === 'list' && (
          <div style={{ display: 'flex', background: T.bg, borderRadius: 7, padding: 2, gap: 2 }}>
            {[['asset','By Class'],['pipeline','Pipeline']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v as any)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: viewMode === v ? T.surface : 'transparent', color: viewMode === v ? T.text : T.textLight, fontSize: 11, fontWeight: viewMode === v ? 600 : 400, cursor: 'pointer', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: T.sans }}>
                {l}
              </button>
            ))}
          </div>
        )}
        {/* Search button */}
        <button
          onClick={() => setShowSearch(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', background: T.bg,
            border: `1px solid ${T.border}`, borderRadius: 7,
            fontSize: 12, color: T.textLight, cursor: 'pointer',
            fontFamily: T.sans, fontWeight: 500,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.blue; (e.currentTarget as HTMLButtonElement).style.color = T.blue }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.textLight }}
        >
          🔍 <span>Search funds</span>
          <kbd style={{ fontSize: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '1px 5px', color: T.textLight }}>⌘K</kbd>
        </button>
        <button onClick={() => setView('upload')} style={{ padding: '7px 16px', background: T.blue, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
          + Upload
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: T.sans, color: T.text, background: T.bg, overflow: 'hidden' }}>

      {/* Global Search Modal */}
      {showSearch && (
        <GlobalSearch
          managers={managers}
          scores={scores}
          onSelect={handleSelect}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Sidebar */}
      <div style={{ width: SW, minWidth: SW, background: T.navy, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.navyBorder}`, transition: 'width .2s', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: collapsed ? '16px 0' : '16px', borderBottom: `1px solid ${T.navyBorder}`, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-.02em' }}>Storgate</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Alternatives</div>
              </div>
            </div>
          )}
          {collapsed && <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>}
          {!collapsed && <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 16, padding: 4 }}>‹</button>}
        </div>
        {collapsed && <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 16, padding: '8px 0', width: '100%' }}>›</button>}

        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Portfolio</div>}
          {!collapsed ? (
            <>
              {navItem(view === 'dashboard', () => setView('dashboard'), '⬛', 'Dashboard', managers.length)}
              {navItem(view === 'ai', () => setView('ai'), '✦', 'AI Assistant')}
            </>
          ) : (
            <>
              <button onClick={() => setView('dashboard')} style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '9px 0', border: 'none', background: view === 'dashboard' ? 'rgba(59,130,246,0.15)' : 'transparent', cursor: 'pointer', borderLeft: view === 'dashboard' ? `2px solid ${T.blue}` : '2px solid transparent' }}>
                <span style={{ color: view === 'dashboard' ? T.blue : 'rgba(255,255,255,0.35)', fontSize: 13 }}>⬛</span>
              </button>
              <button onClick={() => setView('ai')} style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '9px 0', border: 'none', background: view === 'ai' ? 'rgba(59,130,246,0.15)' : 'transparent', cursor: 'pointer', borderLeft: view === 'ai' ? `2px solid ${T.blue}` : '2px solid transparent' }}>
                <span style={{ color: view === 'ai' ? T.blue : 'rgba(255,255,255,0.35)', fontSize: 13 }}>✦</span>
              </button>
            </>
          )}

          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Asset Classes</div>}
          {!collapsed && <div style={{ height: 8 }} />}
          {ASSET_CLASSES.map(ac => navItem(
            view === 'list' && viewMode === 'asset' && selectedAssetClass === ac.id,
            () => { setSelectedAssetClass(ac.id); setViewMode('asset'); setView('list') },
            ac.icon, ac.id, countByClass(ac.id)
          ))}

          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Pipeline</div>}
          {navItem(view === 'list' && viewMode === 'pipeline', () => { setViewMode('pipeline'); setView('list') }, '⬡', 'Kanban Board', managers.length)}
          {!collapsed && PIPELINE_STAGES.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px 5px 16px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', fontFamily: T.mono }}>{countByStage(s.id)}</span>
            </div>
          ))}

          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Research</div>}
          {navItem(view === 'market_research', () => setView('market_research'), '◎', 'Market Research')}
        </div>

        {!collapsed && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.navyBorder}` }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', textAlign: 'center', letterSpacing: '.05em' }}>{managers.length} fund{managers.length !== 1 ? 's' : ''} tracked</div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: view === 'ai' ? 0 : '20px 24px' }}>
          {loading && <div style={{ textAlign: 'center', color: T.textLight, padding: '80px 0' }}>Loading...</div>}
          {!loading && view === 'market_research' && <MarketResearch />}
          {!loading && view === 'dashboard' && <Dashboard managers={managers} scores={scores} onSelectManager={handleSelect} onSelectAssetClass={(ac) => { setSelectedAssetClass(ac); setViewMode('asset'); setView('list') }} />}
          {!loading && view === 'upload' && <DocumentUpload onUploadComplete={handleUploadDone} />}
          {!loading && view === 'ai' && <div style={{ height: '100%' }}><AiAssistant /></div>}
          {!loading && view === 'list' && viewMode === 'asset' && <ManagerList managers={filtered} assetClass={selectedAssetClass} scores={scores} onSelectManager={handleSelect} onUploadClick={() => setView('upload')} />}
          {!loading && view === 'list' && viewMode === 'pipeline' && <KanbanBoard />}
          {!loading && view === 'detail' && selectedManager && <ManagerDetail manager={selectedManager} onBack={() => { setSelectedManager(null); setView('list') }} onStatusChange={handleStatusChange} />}
        </div>
      </div>
    </div>
  )
}

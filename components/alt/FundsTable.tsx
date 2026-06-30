// components/alt/FundsTable.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEF2F2',
  purple: '#8B5CF6',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const PIPELINE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  tracking:       { color: T.slate,  bg: '#F1F5F9',    label: 'Tracking' },
  near_investing: { color: T.amber,  bg: T.amberLight, label: 'Near Investing' },
  investing:      { color: T.green,  bg: T.greenLight, label: 'Investing' },
  pass:           { color: T.red,    bg: T.redLight,   label: 'Pass' },
}

type SortKey =
  | 'fund_name' | 'asset_class' | 'pipeline_status' | 'composite_score'
  | 'fund_size_mm' | 'vintage_year' | 'target_irr' | 'irr_net'
  | 'management_fee_pct' | 'carry_pct' | 'tvpi' | 'dpi'
  | 'hurdle_rate' | 'lock_up_months' | 'gp_commitment_pct'

type SortDir = 'asc' | 'desc'

interface FundsTableProps {
  managers: any[]
  scores: Record<string, any>
  onSelectManager: (m: any) => void
}

function fmt(val: number | null | undefined, type: 'pct' | 'mm' | 'x' | 'yr' | 'mo'): string {
  if (val == null) return '—'
  switch (type) {
    case 'pct': return `${(val * 100).toFixed(2)}%`
    case 'mm':  return val >= 1000 ? `$${(val / 1000).toFixed(1)}B` : `$${val.toFixed(0)}M`
    case 'x':   return `${val.toFixed(2)}x`
    case 'yr':  return `${Math.round(val)}`
    case 'mo':  return `${val}mo`
  }
}

function Th({
  label, k, align = 'right', sortKey, sortDir, onSort,
}: {
  label: string
  k: SortKey
  align?: 'left' | 'right'
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onSort(k)}
      style={{
        padding: '9px 12px',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.07em',
        color: active ? T.blue : T.textLight,
        background: active ? T.blueLight : '#FAFBFC',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        textAlign: align,
        borderBottom: `2px solid ${active ? T.blue : T.border}`,
        fontFamily: T.mono,
      }}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

export default function FundsTable({ managers, scores, onSelectManager }: FundsTableProps) {
  const [facts, setFacts] = useState<Record<string, any>>({})
  const [sortKey, setSortKey] = useState<SortKey>('composite_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [assetFilter, setAssetFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [scoredOnly, setScoredOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFacts() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('alt_facts')
          .select(`
            manager_id, target_irr, tvpi, dpi, carry_pct, hurdle_rate,
            lock_up_months, gp_commitment_pct, vintage_year, fund_size_mm,
            irr_net, irr_gross, management_fee_pct, created_at
          `)
          .order('created_at', { ascending: false })

        if (data) {
          // Merge all facts rows per manager — first non-null value wins (most recent first)
          const merged: Record<string, any> = {}
          for (const row of data) {
            const id = row.manager_id
            if (!merged[id]) merged[id] = {}
            for (const [k, v] of Object.entries(row)) {
              if (k === 'manager_id' || k === 'created_at') continue
              if (merged[id][k] == null && v != null) merged[id][k] = v
            }
          }
          setFacts(merged)
        }
      } catch (e) {
        console.error('FundsTable facts load error:', e)
      } finally {
        setLoading(false)
      }
    }
    loadFacts()
  }, [managers])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const getValue = (m: any, key: SortKey): any => {
    if (key === 'composite_score') return scores[m.id]?.composite_score ?? null
    if (key === 'pipeline_status') return m.pipeline_status ?? null
    if (key === 'asset_class') return m.asset_class ?? null
    if (key === 'fund_name') return m.fund_name ?? null
    const f = facts[m.id] || {}
    return m[key] ?? f[key] ?? null
  }

  const assetClasses = [...new Set(managers.map(m => m.asset_class).filter(Boolean))].sort()

  const filtered = managers
    .filter(m => {
      if (assetFilter && m.asset_class !== assetFilter) return false
      if (stageFilter && m.pipeline_status !== stageFilter) return false
      if (scoredOnly && scores[m.id]?.composite_score == null) return false
      return true
    })
    .sort((a, b) => {
      const av = getValue(a, sortKey)
      const bv = getValue(b, sortKey)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const scoreColor = (s: number | null) =>
    s == null ? T.textLight : s >= 4 ? T.green : s >= 3 ? T.blue : s >= 2 ? T.amber : T.red

  const thProps = { sortKey, sortDir, onSort: handleSort }

  const activeFilters = [assetFilter, stageFilter, scoredOnly].filter(Boolean).length

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* Header + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: '-.01em' }}>Funds Table</div>
          <div style={{ fontSize: 12, color: T.textLight, marginTop: 2 }}>
            {filtered.length} of {managers.length} fund{managers.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ flex: 1 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMid, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={scoredOnly}
            onChange={e => setScoredOnly(e.target.checked)}
            style={{ accentColor: T.blue, width: 14, height: 14 }}
          />
          Scored only
        </label>

        <select
          value={assetFilter}
          onChange={e => setAssetFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 12, color: T.text, background: T.surface, fontFamily: T.sans, cursor: 'pointer' }}
        >
          <option value="">All Asset Classes</option>
          {assetClasses.map(ac => <option key={ac} value={ac}>{ac}</option>)}
        </select>

        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.border}`, fontSize: 12, color: T.text, background: T.surface, fontFamily: T.sans, cursor: 'pointer' }}
        >
          <option value="">All Stages</option>
          {Object.entries(PIPELINE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {activeFilters > 0 && (
          <button
            onClick={() => { setAssetFilter(''); setStageFilter(''); setScoredOnly(false) }}
            style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.red}33`, background: T.redLight, color: T.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}
          >
            Clear filters ({activeFilters})
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: T.textLight, fontSize: 13 }}>
            Loading fund data...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: T.textLight, fontSize: 13 }}>
            No funds match your filters
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: T.textLight, background: '#FAFBFC', borderBottom: `2px solid ${T.border}`, textAlign: 'left', width: 36, fontFamily: T.mono }}>#</th>
                  <Th label="Fund"       k="fund_name"          align="left"  {...thProps} />
                  <Th label="Asset Class" k="asset_class"       align="left"  {...thProps} />
                  <Th label="Stage"      k="pipeline_status"    align="left"  {...thProps} />
                  <Th label="Score"      k="composite_score"                  {...thProps} />
                  <Th label="Fund Size"  k="fund_size_mm"                     {...thProps} />
                  <Th label="Vintage"    k="vintage_year"                     {...thProps} />
                  <Th label="Tgt IRR"    k="target_irr"                       {...thProps} />
                  <Th label="Net IRR"    k="irr_net"                          {...thProps} />
                  <Th label="Mgmt Fee"   k="management_fee_pct"               {...thProps} />
                  <Th label="Carry"      k="carry_pct"                        {...thProps} />
                  <Th label="Hurdle"     k="hurdle_rate"                      {...thProps} />
                  <Th label="TVPI"       k="tvpi"                             {...thProps} />
                  <Th label="DPI"        k="dpi"                              {...thProps} />
                  <Th label="GP Commit"  k="gp_commitment_pct"               {...thProps} />
                  <Th label="Lock-up"    k="lock_up_months"                   {...thProps} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const f = facts[m.id] || {}
                  const score      = scores[m.id]?.composite_score ?? null
                  const hasFlags   = scores[m.id]?.flags && Object.values(scores[m.id].flags).some(Boolean)
                  const stage      = PIPELINE_CONFIG[m.pipeline_status] || PIPELINE_CONFIG.tracking
                  const isStage2   = m.stage2_unlocked || false

                  const fundSize  = m.fund_size_mm        ?? f.fund_size_mm        ?? null
                  const vintage   = m.vintage_year        ?? f.vintage_year        ?? null
                  const targetIRR = m.target_irr          ?? f.target_irr          ?? null
                  const netIRR    = m.irr_net             ?? f.irr_net             ?? null
                  const mgmtFee   = m.management_fee_pct  ?? f.management_fee_pct  ?? null
                  const carry     = m.carry_pct           ?? f.carry_pct           ?? null
                  const hurdle    = m.hurdle_rate         ?? f.hurdle_rate         ?? null
                  const tvpi      = m.tvpi                ?? f.tvpi                ?? null
                  const dpi       = m.dpi                 ?? f.dpi                 ?? null
                  const gpCommit  = m.gp_commitment_pct   ?? f.gp_commitment_pct   ?? null
                  const lockUp    = m.lock_up_months      ?? f.lock_up_months      ?? null

                  const cellR: CSSProperties = {
                    padding: '10px 12px', textAlign: 'right', fontFamily: T.mono,
                    borderBottom: `1px solid ${T.border}`, fontSize: 12,
                    color: T.textMid, whiteSpace: 'nowrap',
                  }
                  const cellL: CSSProperties = { ...cellR, textAlign: 'left', fontFamily: T.sans }

                  return (
                    <tr
                      key={m.id}
                      style={{ cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => onSelectManager(m)}
                    >
                      {/* Row number */}
                      <td style={{ ...cellR, color: T.textLight, fontSize: 11, width: 36 }}>{i + 1}</td>

                      {/* Fund name */}
                      <td style={{ ...cellL, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: T.text }}>{m.fund_name}</span>
                          {hasFlags  && <span style={{ fontSize: 10, color: T.red    }}>⚠</span>}
                          {isStage2  && <span style={{ fontSize: 10, color: T.purple }}>★</span>}
                        </div>
                        {m.manager_name && m.manager_name !== m.fund_name && (
                          <div style={{ fontSize: 11, color: T.textLight, marginTop: 1 }}>{m.manager_name}</div>
                        )}
                      </td>

                      {/* Asset class */}
                      <td style={{ ...cellL, minWidth: 130 }}>
                        <span style={{ fontSize: 11, color: T.textMid }}>{m.asset_class}</span>
                      </td>

                      {/* Stage */}
                      <td style={{ ...cellL, minWidth: 120 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: stage.color, background: stage.bg,
                          padding: '2px 8px', borderRadius: 20,
                          border: `1px solid ${stage.color}33`,
                        }}>
                          {stage.label}
                        </span>
                      </td>

                      {/* Score */}
                      <td style={{ ...cellR, fontWeight: 800, fontSize: 14, color: scoreColor(score), minWidth: 64 }}>
                        {score != null ? score.toFixed(2) : '—'}
                      </td>

                      {/* Fund Size */}
                      <td style={{ ...cellR, minWidth: 80 }}>{fmt(fundSize, 'mm')}</td>

                      {/* Vintage */}
                      <td style={{ ...cellR, minWidth: 64 }}>{fmt(vintage, 'yr')}</td>

                      {/* Target IRR */}
                      <td style={{ ...cellR, minWidth: 72, color: targetIRR != null ? T.text : T.textLight }}>
                        {fmt(targetIRR, 'pct')}
                      </td>

                      {/* Net IRR */}
                      <td style={{ ...cellR, minWidth: 72, color: netIRR != null ? (netIRR >= 0.15 ? T.green : netIRR >= 0.08 ? T.blue : T.amber) : T.textLight }}>
                        {fmt(netIRR, 'pct')}
                      </td>

                      {/* Mgmt Fee */}
                      <td style={{ ...cellR, minWidth: 72, color: mgmtFee != null ? (mgmtFee > 0.02 ? T.amber : T.text) : T.textLight }}>
                        {fmt(mgmtFee, 'pct')}
                      </td>

                      {/* Carry */}
                      <td style={{ ...cellR, minWidth: 64 }}>{fmt(carry, 'pct')}</td>

                      {/* Hurdle */}
                      <td style={{ ...cellR, minWidth: 64 }}>{fmt(hurdle, 'pct')}</td>

                      {/* TVPI */}
                      <td style={{ ...cellR, minWidth: 64, color: tvpi != null ? (tvpi >= 2 ? T.green : tvpi >= 1.5 ? T.blue : T.textMid) : T.textLight }}>
                        {fmt(tvpi, 'x')}
                      </td>

                      {/* DPI */}
                      <td style={{ ...cellR, minWidth: 64 }}>{fmt(dpi, 'x')}</td>

                      {/* GP Commit */}
                      <td style={{ ...cellR, minWidth: 72 }}>{fmt(gpCommit, 'pct')}</td>

                      {/* Lock-up */}
                      <td style={{ ...cellR, minWidth: 64 }}>{fmt(lockUp, 'mo')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 11, color: T.textLight, flexWrap: 'wrap' }}>
        <span>Click any row to open fund detail</span>
        <span>· Click column headers to sort</span>
        <span style={{ color: T.purple }}>★ Stage 2 unlocked</span>
        <span style={{ color: T.red }}>⚠ Has red flags</span>
        <span style={{ color: T.green }}>Net IRR ≥15% green</span>
        <span style={{ color: T.amber }}>Mgmt fee &gt;2% amber</span>
      </div>
    </div>
  )
}

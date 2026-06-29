// components/alt/FilterPanel.tsx
// PRIORITY 3: Sophisticated search + filter for fund portfolio
'use client'

import { useState, useRef, useEffect } from 'react'

const T = {
  blue: '#3B82F6', blueMid: '#93C5FD', blueLight: '#EFF6FF',
  green: '#10B981', greenMid: '#6EE7B7', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberMid: '#FCD34D', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEE2E2',
  slate: '#64748B',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  sans: "'Inter',system-ui,sans-serif",
}

const ASSET_CLASSES = ['PE', 'Private Credit', 'Hedge Funds', 'Managed Futures', 'Real Estate', 'Energy', 'Crypto', 'Opportunistic']
const PIPELINE_STAGES = [
  { id: 'tracking', label: 'Tracking', color: T.slate },
  { id: 'near_investing', label: 'Near Investing', color: T.blue },
  { id: 'investing', label: 'Investing', color: T.green },
  { id: 'pass', label: 'Pass', color: T.red },
]

export interface FilterState {
  searchQuery: string
  assetClasses: Set<string>
  scoreRange: [number, number]
  pipelineStages: Set<string>
  feeRange: [number, number]
}

interface Props {
  funds: Array<{
    id: string
    name: string
    assetClass: string
    score: number | null
    stage: string
    managementFee: number | null
  }>
  onFilterChange: (filters: FilterState) => void
  compact?: boolean
}

function FilterCollapse({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          color: T.textMid,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
        onMouseLeave={(e) => (e.currentTarget.style.color = T.textMid)}
      >
        {title}
        <span style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block', fontSize: 12 }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function FilterPanel({ funds, onFilterChange, compact }: Props) {
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    assetClasses: new Set(),
    scoreRange: [0, 5],
    pipelineStages: new Set(),
    feeRange: [0, 10],
  })

  const [expandedCollapse, setExpandedCollapse] = useState<string | null>(compact ? null : 'search')
  const searchRef = useRef<HTMLInputElement>(null)

  // Propagate filter changes
  useEffect(() => {
    onFilterChange(filters)
  }, [filters])

  // Auto-focus search on Cmd+K
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const handleAssetClassToggle = (ac: string) => {
    const newSet = new Set(filters.assetClasses)
    newSet.has(ac) ? newSet.delete(ac) : newSet.add(ac)
    setFilters({ ...filters, assetClasses: newSet })
  }

  const handlePipelineToggle = (stage: string) => {
    const newSet = new Set(filters.pipelineStages)
    newSet.has(stage) ? newSet.delete(stage) : newSet.add(stage)
    setFilters({ ...filters, pipelineStages: newSet })
  }

  const clearAll = () => {
    setFilters({
      searchQuery: '',
      assetClasses: new Set(),
      scoreRange: [0, 5],
      pipelineStages: new Set(),
      feeRange: [0, 10],
    })
  }

  const activeFilterCount = (filters.assetClasses.size || 0) + (filters.pipelineStages.size || 0) + (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 5 ? 1 : 0) + (filters.feeRange[0] > 0 || filters.feeRange[1] < 10 ? 1 : 0)

  if (compact) {
    return (
      <div style={{ padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 14px', marginBottom: 6 }}>
          Quick Filter
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '0 14px' }}>
          {ASSET_CLASSES.slice(0, 4).map(ac => (
            <button
              key={ac}
              onClick={() => handleAssetClassToggle(ac)}
              style={{
                padding: '6px 10px',
                background: filters.assetClasses.has(ac) ? T.blue : T.border,
                color: filters.assetClasses.has(ac) ? '#fff' : T.textMid,
                border: 'none',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                if (!filters.assetClasses.has(ac)) {
                  el.style.background = T.blueMid
                  el.style.color = '#fff'
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                if (!filters.assetClasses.has(ac)) {
                  el.style.background = T.border
                  el.style.color = T.textMid
                }
              }}
            >
              {ac.split(' ')[0]}
            </button>
          ))}
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              width: '100%',
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              color: T.blue,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 8,
              borderTop: `1px solid ${T.border}`,
            }}
          >
            Clear All ({activeFilterCount})
          </button>
        )}
      </div>
    )
  }

  // Full filter panel
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: T.textMid,
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}>
          Filters
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              padding: '4px 8px',
              background: T.redLight,
              color: T.red,
              border: 'none',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '14px 14px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 14, color: T.textLight }}>🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search funds, GPs... (⌘K)"
            value={filters.searchQuery}
            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              outline: 'none',
              fontFamily: T.sans,
              color: T.text,
            }}
          />
          {filters.searchQuery && (
            <button
              onClick={() => setFilters({ ...filters, searchQuery: '' })}
              style={{
                padding: '2px 6px',
                background: 'transparent',
                border: 'none',
                color: T.textLight,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Asset Class */}
      <FilterCollapse title="Asset Class" defaultOpen={true}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ASSET_CLASSES.map(ac => (
            <label key={ac} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: T.text,
            }}>
              <input
                type="checkbox"
                checked={filters.assetClasses.has(ac)}
                onChange={() => handleAssetClassToggle(ac)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              />
              <span>{ac}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textLight, fontWeight: 600 }}>
                {funds.filter(f => f.assetClass === ac).length}
              </span>
            </label>
          ))}
        </div>
      </FilterCollapse>

      {/* Score Range */}
      <FilterCollapse title="Score" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: T.text }}>
            <span>{filters.scoreRange[0].toFixed(1)}</span>
            <span>{filters.scoreRange[1].toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={filters.scoreRange[0]}
            onChange={(e) => setFilters({
              ...filters,
              scoreRange: [parseFloat(e.target.value), filters.scoreRange[1]]
            })}
            style={{ width: '100%' }}
          />
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={filters.scoreRange[1]}
            onChange={(e) => setFilters({
              ...filters,
              scoreRange: [filters.scoreRange[0], parseFloat(e.target.value)]
            })}
            style={{ width: '100%' }}
          />
        </div>
      </FilterCollapse>

      {/* Pipeline Status */}
      <FilterCollapse title="Pipeline Status" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PIPELINE_STAGES.map(stage => (
            <label key={stage.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: T.text,
            }}>
              <input
                type="checkbox"
                checked={filters.pipelineStages.has(stage.id)}
                onChange={() => handlePipelineToggle(stage.id)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: stage.color,
                }} />
                {stage.label}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textLight, fontWeight: 600 }}>
                {funds.filter(f => f.stage === stage.id).length}
              </span>
            </label>
          ))}
        </div>
      </FilterCollapse>

      {/* Fee Range */}
      <FilterCollapse title="Management Fee" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: T.text }}>
            <span>{filters.feeRange[0].toFixed(2)}%</span>
            <span>{filters.feeRange[1].toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={filters.feeRange[0]}
            onChange={(e) => setFilters({
              ...filters,
              feeRange: [parseFloat(e.target.value), filters.feeRange[1]]
            })}
            style={{ width: '100%' }}
          />
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={filters.feeRange[1]}
            onChange={(e) => setFilters({
              ...filters,
              feeRange: [filters.feeRange[0], parseFloat(e.target.value)]
            })}
            style={{ width: '100%' }}
          />
        </div>
      </FilterCollapse>
    </div>
  )
}

// ── Fuzzy search utility for fund filtering ────────────────────────────────────
export function fuzzyMatch(query: string, text: string): boolean {
  const searchStr = query.toLowerCase().replace(/\s+/g, '')
  const targetStr = text.toLowerCase().replace(/\s+/g, '')
  
  let searchIdx = 0
  for (let i = 0; i < targetStr.length && searchIdx < searchStr.length; i++) {
    if (targetStr[i] === searchStr[searchIdx]) searchIdx++
  }
  return searchIdx === searchStr.length
}

// ── Apply filters to fund list ────────────────────────────────────────────────
export function applyFilters(funds: any[], filters: FilterState) {
  return funds.filter(fund => {
    // Search
    if (filters.searchQuery && !fuzzyMatch(filters.searchQuery, fund.name) && !fuzzyMatch(filters.searchQuery, fund.gp_name || '')) {
      return false
    }

    // Asset class
    if (filters.assetClasses.size && !filters.assetClasses.has(fund.assetClass)) {
      return false
    }

    // Score range
    if (fund.score != null && (fund.score < filters.scoreRange[0] || fund.score > filters.scoreRange[1])) {
      return false
    }

    // Pipeline stage
    if (filters.pipelineStages.size && !filters.pipelineStages.has(fund.stage)) {
      return false
    }

    // Fee range
    if (fund.managementFee != null && (fund.managementFee < filters.feeRange[0] || fund.managementFee > filters.feeRange[1])) {
      return false
    }

    return true
  })
}

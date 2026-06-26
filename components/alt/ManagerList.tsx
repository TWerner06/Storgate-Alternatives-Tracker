// components/alt/ManagerList.tsx
'use client'

import { CSSProperties } from 'react'

const PIPELINE_COLORS: Record<string, { color: string; bg: string }> = {
  tracking: { color: '#6B7FA3', bg: '#EEF1F8' },
  near_investing: { color: '#B8860B', bg: '#FDF8E6' },
  investing: { color: '#2D6A2D', bg: '#EDF7ED' },
  pass: { color: '#999', bg: '#F5F4F1' },
}

const PIPELINE_LABELS: Record<string, string> = {
  tracking: 'Tracking',
  near_investing: 'Near Investing',
  investing: 'Investing',
  pass: 'Pass',
}

interface ManagerListProps {
  managers: any[]
  assetClass: string
  onSelectManager: (manager: any) => void
  onUploadClick: () => void
}

export default function ManagerList({ managers, assetClass, onSelectManager, onUploadClick }: ManagerListProps) {

  const totalFundSize = managers.reduce((sum, m) => sum + (m.fund_size_mm || 0), 0)
  const avgFee = (() => {
    const withFee = managers.filter(m => m.management_fee_pct)
    if (!withFee.length) return null
    return withFee.reduce((sum, m) => sum + m.management_fee_pct, 0) / withFee.length
  })()

  const emptyState: CSSProperties = {
    textAlign: 'center',
    padding: '80px 20px',
    color: '#aaa',
  }

  if (managers.length === 0) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#666', marginBottom: 6 }}>No {assetClass} funds yet</div>
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>Upload a fund document to get started</div>
        <button onClick={onUploadClick} style={{ padding: '8px 18px', background: '#0F1E2E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          + Upload Document
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatCard label="Funds" value={managers.length.toString()} />
        {totalFundSize > 0 && <StatCard label="Total Opportunity Size" value={`$${totalFundSize.toFixed(0)}M`} />}
        {avgFee != null && <StatCard label="Avg Management Fee" value={`${(avgFee * 100).toFixed(2)}%`} />}
        <StatCard label="Tracking" value={managers.filter(m => m.pipeline_status === 'tracking').length.toString()} />
        <StatCard label="Near Investing" value={managers.filter(m => m.pipeline_status === 'near_investing').length.toString()} accent="#B8860B" />
        <StatCard label="Investing" value={managers.filter(m => m.pipeline_status === 'investing').length.toString()} accent="#2D6A2D" />
      </div>

      {/* Fund grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {managers.map(manager => (
          <FundCard key={manager.id} manager={manager} onClick={() => onSelectManager(manager)} />
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent = '#1C2B3A' }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E8E6E0', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'monospace', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: 'monospace', letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

function FundCard({ manager, onClick }: { manager: any; onClick: () => void }) {
  const status = PIPELINE_COLORS[manager.pipeline_status] || PIPELINE_COLORS.tracking
  const statusLabel = PIPELINE_LABELS[manager.pipeline_status] || 'Tracking'

  return (
    <div
      onClick={onClick}
      style={{ background: '#fff', border: '1px solid #E8E6E0', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#4A9EE7'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(74,158,231,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E6E0'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Status stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: status.color, opacity: 0.6 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, marginTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2B3A', letterSpacing: '-.01em', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {manager.fund_name}
          </div>
          <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {manager.manager_name}
          </div>
        </div>
        <div style={{ marginLeft: 10, flexShrink: 0, padding: '3px 8px', background: status.bg, color: status.color, borderRadius: 10, fontSize: 10, fontWeight: 600, border: `1px solid ${status.color}33` }}>
          {statusLabel}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, borderTop: '1px solid #F0EEE8', paddingTop: 10 }}>
        {manager.fund_size_mm && (
          <Metric label="Fund Size" value={`$${manager.fund_size_mm}M`} />
        )}
        {manager.management_fee_pct && (
          <Metric label="Mgmt Fee" value={`${(manager.management_fee_pct * 100).toFixed(2)}%`} />
        )}
        {manager.carry_pct && (
          <Metric label="Carry" value={`${(manager.carry_pct * 100).toFixed(0)}%`} />
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2B3A', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

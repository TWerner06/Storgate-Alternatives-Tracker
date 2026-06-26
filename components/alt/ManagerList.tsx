// components/alt/ManagerList.tsx
'use client'

import { CSSProperties } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#F87171', redLight: '#FEF2F2',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  sans: "'Inter', system-ui, sans-serif",
}

const PIPELINE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  tracking: { color: T.slate, bg: '#F1F5F9', label: 'Tracking' },
  near_investing: { color: T.amber, bg: T.amberLight, label: 'Near Investing' },
  investing: { color: T.green, bg: T.greenLight, label: 'Investing' },
  pass: { color: '#CBD5E1', bg: '#F8FAFC', label: 'Pass' },
}

// Donut chart colors (blue family for asset class breakdown)
const DONUT_COLORS = ['#1D4ED8','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#DBEAFE','#EFF6FF','#F0F9FF']

interface ManagerListProps {
  managers: any[]
  assetClass: string
  onSelectManager: (m: any) => void
  onUploadClick: () => void
}

export default function ManagerList({ managers, assetClass, onSelectManager, onUploadClick }: ManagerListProps) {
  const totalSize = managers.reduce((s, m) => s + (m.fund_size_mm || 0), 0)
  const withFee = managers.filter(m => m.management_fee_pct)
  const avgFee = withFee.length ? withFee.reduce((s, m) => s + m.management_fee_pct, 0) / withFee.length : null

  const pipelineCounts = {
    tracking: managers.filter(m => m.pipeline_status === 'tracking').length,
    near_investing: managers.filter(m => m.pipeline_status === 'near_investing').length,
    investing: managers.filter(m => m.pipeline_status === 'investing').length,
    pass: managers.filter(m => m.pipeline_status === 'pass').length,
  }

  const pieData = Object.entries(pipelineCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: PIPELINE_CONFIG[k].label, value: v, color: PIPELINE_CONFIG[k].color }))

  if (managers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.15 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>No {assetClass} funds yet</div>
        <div style={{ fontSize: 13, color: T.textLight, marginBottom: 20 }}>Upload a fund document to get started</div>
        <button onClick={onUploadClick} style={{ padding: '9px 20px', background: T.blue, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          + Upload Document
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 180px', gap: 14, marginBottom: 24, alignItems: 'stretch' }}>
        <SummaryCard label="Total Funds" value={managers.length.toString()} color={T.blue} />
        <SummaryCard label="Opportunity Size" value={totalSize > 0 ? `$${totalSize.toFixed(0)}M` : '—'} color={T.blue} />
        <SummaryCard label="Avg Management Fee" value={avgFee != null ? `${(avgFee * 100).toFixed(2)}%` : '—'} color={T.amber} />

        {/* Mini pipeline donut */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ResponsiveContainer width={56} height={56}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={16} outerRadius={26} dataKey="value" strokeWidth={0}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: T.textMid }}>{d.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text, marginLeft: 'auto', fontFamily: T.mono }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fund grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
        {managers.map(m => <FundCard key={m.id} manager={m} onClick={() => onSelectManager(m)} />)}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid #E2E8F0`, borderRadius: 10, padding: '14px 18px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.09em', fontFamily: T.mono, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', fontFamily: T.mono, letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

function FundCard({ manager, onClick }: { manager: any; onClick: () => void }) {
  const status = PIPELINE_CONFIG[manager.pipeline_status] || PIPELINE_CONFIG.tracking

  return (
    <div onClick={onClick}
      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'all .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Color stripe */}
      <div style={{ height: 3, background: status.color }} />

      <div style={{ padding: '14px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-.02em', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {manager.fund_name}
            </div>
            <div style={{ fontSize: 11, color: T.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {manager.manager_name}
            </div>
          </div>
          <span style={{ flexShrink: 0, marginLeft: 10, padding: '3px 9px', background: status.bg, color: status.color, borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${status.color}33`, letterSpacing: '-.01em' }}>
            {status.label}
          </span>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          {manager.fund_size_mm && <Metric label="Fund Size" value={`$${manager.fund_size_mm}M`} />}
          {manager.management_fee_pct && <Metric label="Mgmt Fee" value={`${(manager.management_fee_pct * 100).toFixed(2)}%`} color={T.amber} />}
          {manager.carry_pct && <Metric label="Carry" value={`${(manager.carry_pct * 100).toFixed(0)}%`} />}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color = '#0F172A' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4, fontFamily: T.mono }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.mono }}>{value}</div>
    </div>
  )
}

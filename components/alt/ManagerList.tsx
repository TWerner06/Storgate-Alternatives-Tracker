// components/alt/ManagerList.tsx
'use client'

import { CSSProperties } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEF2F2',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const PIPELINE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  tracking:       { color: T.slate, bg: '#F1F5F9',    label: 'Tracking' },
  near_investing: { color: T.amber, bg: T.amberLight, label: 'Near Investing' },
  investing:      { color: T.green, bg: T.greenLight, label: 'Investing' },
  pass:           { color: T.red,   bg: T.redLight,   label: 'Pass' },
}

const DONUT_COLORS = [T.slate, T.amber, T.green, T.red]

interface Props {
  managers: any[]
  assetClass: string
  scores: Record<string, any>
  onSelectManager: (m: any) => void
  onUploadClick: () => void
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700 }}>{payload[0].name}: {payload[0].value}</div>
    </div>
  )
}

export default function ManagerList({ managers, assetClass, scores, onSelectManager, onUploadClick }: Props) {
  const totalSize = managers.reduce((s, m) => s + (m.fund_size_mm || 0), 0)
  const withFee = managers.filter(m => m.management_fee_pct)
  const avgFee = withFee.length ? withFee.reduce((s, m) => s + m.management_fee_pct, 0) / withFee.length : null

  const pipelineData = [
    { name: 'Tracking',       value: managers.filter(m => m.pipeline_status === 'tracking').length,       color: T.slate },
    { name: 'Near Investing', value: managers.filter(m => m.pipeline_status === 'near_investing').length, color: T.amber },
    { name: 'Investing',      value: managers.filter(m => m.pipeline_status === 'investing').length,      color: T.green },
    { name: 'Pass',           value: managers.filter(m => m.pipeline_status === 'pass').length,           color: T.red },
  ].filter(d => d.value > 0)

  const scoredManagers = managers.filter(m => scores[m.id]?.composite_score != null)
  const avgScore = scoredManagers.length ? scoredManagers.reduce((s, m) => s + scores[m.id].composite_score, 0) / scoredManagers.length : null

  if (managers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.12 }}>◈</div>
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
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 200px', gap: 14, marginBottom: 22 }}>
        <StatCard label="Funds" value={managers.length.toString()} accent={T.blue} />
        <StatCard label="Opportunity Size" value={totalSize > 0 ? `$${totalSize.toFixed(0)}M` : '—'} accent={T.blue} />
        <StatCard label="Avg Score" value={avgScore != null ? avgScore.toFixed(2) : '—'} accent={avgScore != null ? (avgScore >= 4 ? T.green : avgScore >= 3 ? T.blue : T.amber) : T.border} />

        {/* Pipeline mini donut */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {pipelineData.length > 1 ? (
            <ResponsiveContainer width={52} height={52}>
              <PieChart>
                <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={14} outerRadius={24} dataKey="value" strokeWidth={2} stroke="#fff">
                  {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: pipelineData[0]?.color || T.slate, opacity: 0.3, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            {pipelineData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: T.textMid, flex: 1 }}>{d.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px,1fr))', gap: 14 }}>
        {managers.map(m => <FundCard key={m.id} manager={m} score={scores[m.id]?.composite_score} onClick={() => onSelectManager(m)} />)}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid #E2E8F0`, borderRadius: 10, padding: '14px 18px', borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.09em', fontFamily: T.mono, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', fontFamily: T.mono }}>{value}</div>
    </div>
  )
}

function FundCard({ manager, score, onClick }: { manager: any; score?: number; onClick: () => void }) {
  const status = PIPELINE_CONFIG[manager.pipeline_status] || PIPELINE_CONFIG.tracking
  const scoreColor = score == null ? T.textLight : score >= 4 ? T.green : score >= 3 ? T.blue : T.amber

  return (
    <div onClick={onClick}
      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'all .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ height: 3, background: status.color }} />
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-.02em', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager.fund_name}</div>
            <div style={{ fontSize: 11, color: T.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager.manager_name}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 10, flexShrink: 0 }}>
            <span style={{ padding: '3px 9px', background: status.bg, color: status.color, borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${status.color}33` }}>
              {status.label}
            </span>
            {score != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, fontFamily: T.mono }}>
                {score.toFixed(2)} ★
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          {manager.fund_size_mm && <Metric label="Fund Size" value={`$${manager.fund_size_mm}M`} />}
          {manager.management_fee_pct && <Metric label="Mgmt Fee" value={`${(manager.management_fee_pct*100).toFixed(2)}%`} color={T.amber} />}
          {manager.carry_pct && <Metric label="Carry" value={`${(manager.carry_pct*100).toFixed(0)}%`} />}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color = T.text }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4, fontFamily: T.mono }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.mono }}>{value}</div>
    </div>
  )
}

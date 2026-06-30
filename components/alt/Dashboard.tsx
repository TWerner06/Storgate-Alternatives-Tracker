// components/alt/Dashboard.tsx
'use client'

import { CSSProperties } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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
  tracking:       { color: T.slate,  bg: '#F1F5F9', label: 'Tracking' },
  near_investing: { color: T.amber,  bg: T.amberLight, label: 'Near Investing' },
  investing:      { color: T.green,  bg: T.greenLight, label: 'Investing' },
  pass:           { color: T.red,    bg: T.redLight, label: 'Pass' },
}

// Asset class donut colors — distinct hues so each slice is identifiable at a glance
const ASSET_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#94A3B8']

interface DashboardProps {
  managers: any[]
  scores: Record<string, any>
  onSelectManager: (m: any) => void
  onSelectAssetClass: (ac: string) => void
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, color: T.text }}>{payload[0].name}</div>
      <div style={{ color: T.textMid, fontFamily: T.mono }}>{payload[0].value} fund{payload[0].value !== 1 ? 's' : ''}</div>
    </div>
  )
}

export default function Dashboard({ managers, scores, onSelectManager, onSelectAssetClass }: DashboardProps) {
  const totalFunds = managers.length
  const totalSize = managers.reduce((s, m) => s + (m.fund_size_mm || 0), 0)
  const scoredFunds = managers.filter(m => scores[m.id]?.composite_score != null)
  const avgScore = scoredFunds.length ? scoredFunds.reduce((s, m) => s + scores[m.id].composite_score, 0) / scoredFunds.length : null

  // Pipeline donut data
  const pipelineData = Object.entries(PIPELINE_CONFIG)
    .map(([k, v]) => ({ name: v.label, value: managers.filter(m => m.pipeline_status === k).length, color: v.color }))
    .filter(d => d.value > 0)

  // Asset class donut data
  const ASSET_CLASSES = ['Private Equity','Private Credit','Hedge Funds','Managed Futures','Private Real Estate','Energy','Crypto Assets','Opportunistic','Research']
  const assetData = ASSET_CLASSES
    .map((ac, i) => ({ name: ac, value: managers.filter(m => m.asset_class === ac).length, color: ASSET_COLORS[i] }))
    .filter(d => d.value > 0)

  // Top scored funds
  const topFunds = [...managers]
    .filter(m => scores[m.id]?.composite_score != null)
    .sort((a, b) => (scores[b.id]?.composite_score || 0) - (scores[a.id]?.composite_score || 0))
    .slice(0, 5)

  // Active red flags
  const flaggedFunds = managers.filter(m => {
    const s = scores[m.id]
    return s?.flags && Object.values(s.flags).some(Boolean)
  })

  const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 16 }
  const secTitle: CSSProperties = { fontSize: 13, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 18, paddingBottom: 11, borderBottom: `1px solid ${T.border}` }
  const statCard: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ ...statCard, borderTop: `3px solid ${T.blue}` }}>
          <div style={{ fontSize: 10, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.mono, marginBottom: 7 }}>Total Funds</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: T.text, fontFamily: T.mono, letterSpacing: '-.01em' }}>{totalFunds}</div>
        </div>
        <div style={{ ...statCard, borderTop: `3px solid ${T.blue}` }}>
          <div style={{ fontSize: 10, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.mono, marginBottom: 7 }}>Opportunity Size</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: T.text, fontFamily: T.mono, letterSpacing: '-.01em' }}>{totalSize > 0 ? `$${totalSize >= 1000 ? (totalSize/1000).toFixed(1)+'B' : totalSize.toFixed(0)+'M'}` : '—'}</div>
        </div>
        <div style={{ ...statCard, borderTop: `3px solid ${T.green}` }}>
          <div style={{ fontSize: 10, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.mono, marginBottom: 7 }}>Avg Score</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: avgScore != null ? (avgScore >= 4 ? T.green : avgScore >= 3 ? T.blue : T.amber) : T.textLight, fontFamily: T.mono, letterSpacing: '-.01em' }}>
            {avgScore != null ? avgScore.toFixed(2) : '—'}
          </div>
        </div>
        <div style={{ ...statCard, borderTop: `3px solid ${flaggedFunds.length > 0 ? T.red : T.border}` }}>
          <div style={{ fontSize: 10, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: T.mono, marginBottom: 7 }}>Active Flags</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: flaggedFunds.length > 0 ? T.red : T.textLight, fontFamily: T.mono, letterSpacing: '-.01em' }}>{flaggedFunds.length}</div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Pipeline donut */}
        <div style={sec}>
          <div style={secTitle}>Pipeline Breakdown</div>
          {pipelineData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: T.textLight, fontSize: 12 }}>No funds yet</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" strokeWidth={2} stroke="#fff">
                    {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {pipelineData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: T.textMid, flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Asset class donut */}
        <div style={sec}>
          <div style={secTitle}>Allocation by Asset Class</div>
          {assetData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: T.textLight, fontSize: 12 }}>No funds yet</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={assetData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" strokeWidth={2} stroke="#fff">
                    {assetData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {assetData.map((d, i) => (
                  <div key={i} onClick={() => onSelectAssetClass(d.name)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', padding: '3px 6px', borderRadius: 5, transition: 'all .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.blueLight}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: T.textMid, flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Top scored funds */}
        <div style={sec}>
          <div style={secTitle}>Top Scored Opportunities</div>
          {topFunds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: T.textLight, fontSize: 12 }}>Score funds to see rankings</div>
          ) : topFunds.map((m, i) => {
            const score = scores[m.id]?.composite_score
            const rec = score >= 4 ? { color: T.green, label: 'Conviction Buy' } : score >= 3 ? { color: T.blue, label: 'Approved' } : { color: T.amber, label: 'Watch List' }
            return (
              <div key={m.id} onClick={() => onSelectManager(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 8, cursor: 'pointer', marginBottom: 8, border: `1px solid ${T.border}`, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.background = T.blueLight }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 7, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: T.textMid, fontFamily: T.mono, flexShrink: 0 }}>#{i+1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fund_name}</div>
                  <div style={{ fontSize: 11.5, color: T.textLight }}>{m.asset_class}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: rec.color, fontFamily: T.mono }}>{score.toFixed(2)}</div>
                  <div style={{ fontSize: 10.5, color: rec.color, fontWeight: 600 }}>{rec.label}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Red flags */}
        <div style={sec}>
          <div style={secTitle}>⚠ Active Red Flags</div>
          {flaggedFunds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: T.textLight, fontSize: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>✓</div>
              No active red flags across portfolio
            </div>
          ) : flaggedFunds.map(m => {
            const activeFlags = Object.entries(scores[m.id]?.flags || {}).filter(([, v]) => v)
            return (
              <div key={m.id} onClick={() => onSelectManager(m)}
                style={{ padding: '11px 13px', borderRadius: 8, cursor: 'pointer', marginBottom: 8, border: `1px solid ${T.red}33`, background: '#FEF2F2', transition: 'all .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.red}
                onMouseLeave={e => e.currentTarget.style.borderColor = `${T.red}33`}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 5 }}>{m.fund_name}</div>
                <div style={{ fontSize: 11, color: '#991B1B' }}>
                  {activeFlags.length} flag{activeFlags.length !== 1 ? 's' : ''} active
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

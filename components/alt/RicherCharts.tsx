// components/alt/RicherCharts.tsx
'use client'

import { CSSProperties } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LineChart, Line, Legend } from 'recharts'

const T = {
  blue: '#3B82F6', blueMid: '#93C5FD', blueLight: '#EFF6FF',
  green: '#10B981', greenMid: '#6EE7B7',
  amber: '#F59E0B', amberMid: '#FCD34D',
  red: '#EF4444', redMid: '#FCA5A5',
  purple: '#8B5CF6', purpleMid: '#C4B5FD',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || T.textMid, fontFamily: T.mono, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }
const secTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }
const emptyS: CSSProperties = { textAlign: 'center', padding: '30px', color: T.textLight, fontSize: 12 }

interface Props {
  facts: any
  cashflows: any[]
  trackRecord?: Record<string, string>[]
}

export default function RicherCharts({ facts, cashflows, trackRecord }: Props) {
  if (!facts) return <div style={sec}><div style={emptyS}>No data for charts yet. Upload documents to populate.</div></div>

  // Returns chart — actual vs target
  const returnsData = [
    facts.irr_net != null && { name: 'Net IRR (Actual)', value: parseFloat((facts.irr_net * 100).toFixed(1)), fill: T.blue, type: 'actual' },
    facts.irr_gross != null && { name: 'Gross IRR (Actual)', value: parseFloat((facts.irr_gross * 100).toFixed(1)), fill: T.blueMid, type: 'actual' },
    facts.target_irr != null && { name: 'Target IRR', value: parseFloat((facts.target_irr * 100).toFixed(1)), fill: '#BFDBFE', type: 'target' },
  ].filter(Boolean) as any[]

  // TVPI/DPI/RVPI breakdown
  const tvpi = facts.tvpi || 0
  const dpi = facts.dpi || 0
  const rvpi = tvpi - dpi
  const multiplesData = [
    tvpi > 0 && { name: 'TVPI', value: parseFloat(tvpi.toFixed(2)), fill: T.green },
    dpi > 0 && { name: 'DPI (Realized)', value: parseFloat(dpi.toFixed(2)), fill: T.green },
    rvpi > 0 && { name: 'RVPI (Unrealized)', value: parseFloat(rvpi.toFixed(2)), fill: T.greenMid },
    facts.moic != null && { name: 'MOIC', value: parseFloat(facts.moic.toFixed(2)), fill: '#A7F3D0' },
  ].filter(Boolean) as any[]

  // Capital deployment
  const capitalData = [
    facts.fund_size_mm != null && { name: 'Target Size', value: facts.fund_size_mm, fill: T.purple },
    facts.committed_capital_mm != null && { name: 'Committed', value: facts.committed_capital_mm, fill: T.purpleMid },
    facts.called_capital_mm != null && { name: 'Called', value: facts.called_capital_mm, fill: '#DDD6FE' },
    facts.unfunded_capital_mm != null && { name: 'Unfunded', value: facts.unfunded_capital_mm, fill: '#EDE9FE' },
  ].filter(Boolean) as any[]

  // Fee burden chart
  const grossIRR = facts.irr_gross ? facts.irr_gross * 100 : null
  const netIRR = facts.irr_net ? facts.irr_net * 100 : null
  const feeBurden = grossIRR != null && netIRR != null ? parseFloat((grossIRR - netIRR).toFixed(1)) : null

  const feeData = grossIRR != null && netIRR != null ? [
    { name: 'Gross IRR', value: parseFloat(grossIRR.toFixed(1)), fill: T.blue },
    { name: 'Fee Drag', value: feeBurden, fill: T.amber },
    { name: 'Net IRR', value: parseFloat(netIRR.toFixed(1)), fill: T.green },
  ] : []

  // Cashflow timeline
  const cfData = cashflows.slice(0, 12).map((cf: any) => ({
    name: new Date(cf.cashflow_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    value: cf.cashflow_type === 'Capital Call' ? -cf.amount_mm : cf.amount_mm,
    fill: cf.cashflow_type === 'Capital Call' ? T.red : T.green,
  }))

  // Track record history (from Stage 2)
  const trData = trackRecord?.filter(f => f.vintage_year && f.net_irr).map(f => ({
    name: `Fund (${f.vintage_year})`,
    net_irr: parseFloat(f.net_irr?.replace('%', '') || '0'),
    peer_median: parseFloat(f.peer_median_irr?.replace('%', '') || '0'),
    tvpi: parseFloat(f.tvpi || '0'),
  })) || []

  const hasChart = (data: any[]) => data.length > 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Returns: Actual vs Target */}
      {hasChart(returnsData) && (
        <div style={sec}>
          <div style={secTitle}>Returns: Actual vs Target (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={returnsData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} name="IRR %">
                {returnsData.map((d, i) => <Cell key={i} fill={d.fill} opacity={d.type === 'target' ? 0.5 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TVPI/DPI/RVPI breakdown */}
      {hasChart(multiplesData) && (
        <div style={sec}>
          <div style={secTitle}>Multiples: TVPI / DPI / RVPI (x)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={multiplesData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="x" />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={1} stroke={T.slate} strokeDasharray="4 2" />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} name="Multiple">
                {multiplesData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fee drag visualization */}
      {hasChart(feeData) && (
        <div style={sec}>
          <div style={secTitle}>Fee Drag: Gross → Net IRR (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={feeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} name="IRR %">
                {feeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {feeBurden != null && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: T.amberLight, borderRadius: 6, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
              Fee drag: {feeBurden.toFixed(1)}% ({feeBurden > 5 ? 'Above market — scrutinize fee terms' : 'Within normal range'})
            </div>
          )}
        </div>
      )}

      {/* Capital deployment */}
      {hasChart(capitalData) && (
        <div style={sec}>
          <div style={secTitle}>Capital Structure ($M)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={capitalData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="M" />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} name="$M">
                {capitalData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cashflow timeline */}
      {hasChart(cfData) && (
        <div style={{ ...sec, gridColumn: '1 / -1' }}>
          <div style={secTitle}>Cashflow Activity ($M)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cfData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke={T.slate} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="$M">
                {cfData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Track record history */}
      {hasChart(trData) && (
        <div style={{ ...sec, gridColumn: '1 / -1' }}>
          <div style={secTitle}>Track Record History — Net IRR vs Peer Median (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.textLight }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textLight }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="net_irr" stroke={T.blue} strokeWidth={2.5} dot={{ r: 5, fill: T.blue }} name="Net IRR" />
              <Line type="monotone" dataKey="peer_median" stroke={T.slate} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: T.slate }} name="Peer Median" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!hasChart(returnsData) && !hasChart(multiplesData) && !hasChart(capitalData) && !hasChart(cfData) && (
        <div style={{ ...sec, gridColumn: '1 / -1' }}>
          <div style={emptyS}>No chart data available yet. Upload more documents to populate.</div>
        </div>
      )}
    </div>
  )
}

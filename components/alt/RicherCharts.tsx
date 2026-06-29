// components/alt/RicherCharts.tsx
'use client'

import { CSSProperties } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LineChart, Line, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Area,
} from 'recharts'

const T = {
  blue: '#3B82F6', blueMid: '#93C5FD', blueLight: '#EFF6FF',
  green: '#10B981', greenMid: '#6EE7B7', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberMid: '#FCD34D', amberLight: '#FFFBEB',
  red: '#EF4444', redMid: '#FCA5A5',
  purple: '#8B5CF6', purpleMid: '#C4B5FD',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontFamily: T.sans }}>
      {label && <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || T.textMid, fontFamily: T.mono, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
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
  scores?: Record<string, number | null>
  trackRecord?: Record<string, string>[]
}

// ── Radar chart for scorecard pillars ────────────────────────────────────────
// FIXED: Now calculates pillar scores from whatever fields are in the scores object
function ScorecardRadar({ scores }: { scores: Record<string, number | null> }) {
  // Group score fields into pillars by common prefixes
  const pillars: Record<string, string[]> = {
    'Returns': [],
    'Process': [],
    'People': [],
    'Risk': [],
  }

  // Map any score field to its pillar based on name patterns
  Object.keys(scores).forEach(key => {
    if (!scores[key]) return // Skip null/undefined
    
    if (key.includes('irr') || key.includes('moic') || key.includes('sharpe') || key.includes('yield') || key.includes('pme')) {
      pillars['Returns'].push(key)
    } else if (key.includes('sourcing') || key.includes('underwriting') || key.includes('entry') || key.includes('strategy')) {
      pillars['Process'].push(key)
    } else if (key.includes('team') || key.includes('gp') || key.includes('pm') || key.includes('credit')) {
      pillars['People'].push(key)
    } else if (key.includes('drawdown') || key.includes('concentration') || key.includes('covenant') || key.includes('risk')) {
      pillars['Risk'].push(key)
    }
  })

  const radarData = Object.entries(pillars)
    .map(([pillar, fieldIds]) => {
      if (!fieldIds.length) return null
      const vals = fieldIds.map(id => scores[id]).filter((v): v is number => v != null && typeof v === 'number')
      if (!vals.length) return null
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      return {
        subject: pillar,
        score: parseFloat(avg.toFixed(2)),
        fullMark: 5,
      }
    })
    .filter((d): d is any => d !== null)

  // Need at least 2 pillars to render meaningful radar
  if (radarData.length < 2) return null

  return (
    <div style={sec}>
      <div style={secTitle}>Score Distribution — Radar View</div>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={radarData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
          <defs>
            <linearGradient id="radarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={T.blue} stopOpacity={0.3} />
              <stop offset="100%" stopColor={T.blue} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <PolarGrid stroke={T.border} strokeDasharray="3 3" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fontSize: 12, fill: T.text, fontFamily: T.sans, fontWeight: 600 }} 
          />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 5]} 
            tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }}
            tickFormatter={(v) => v.toString()}
          />
          <Radar 
            name="Score" 
            dataKey="score" 
            stroke={T.blue}
            strokeWidth={2.5}
            fill="url(#radarGrad)"
            dot={{ r: 5, fill: T.blue, strokeWidth: 2, stroke: T.surface }}
            activeDot={{ r: 6, strokeWidth: 1 }}
          />
          <Tooltip content={<ChartTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 12, fontSize: 11, color: T.textLight, fontFamily: T.mono }}>
        {radarData.map(d => (
          <div key={d.subject} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
            <span>{d.subject}</span>
            <span style={{ fontWeight: 600, color: T.text }}>{d.score.toFixed(2)} / 5.0</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Waterfall chart for fee drag ─────────────────────────────────────────────
function FeeDragWaterfall({ grossIRR, netIRR }: { grossIRR: number; netIRR: number }) {
  const drag = parseFloat((grossIRR - netIRR).toFixed(1))
  const data = [
    { name: 'Gross IRR', value: grossIRR, fill: T.blue },
    { name: 'Fee & Carry Drag', value: -drag, fill: T.amber },
    { name: 'Net IRR', value: netIRR, fill: T.green },
  ]
  const isHighDrag = drag > 5

  return (
    <div style={sec}>
      <div style={secTitle}>Fee Drag: Gross → Net IRR (%)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="blueGradFee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.blue} stopOpacity={1} />
              <stop offset="100%" stopColor={T.blueMid} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="amberGradFee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.amber} stopOpacity={1} />
              <stop offset="100%" stopColor={T.amberMid} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="greenGradFee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.green} stopOpacity={1} />
              <stop offset="100%" stopColor={T.greenMid} stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.textMid, fontFamily: T.sans, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke={T.slate} strokeWidth={1} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} name="IRR %" strokeWidth={1.5}>
            {data.map((d, i) => {
              let gradId = 'blueGradFee'
              if (d.fill === T.amber) gradId = 'amberGradFee'
              if (d.fill === T.green) gradId = 'greenGradFee'
              return <Cell key={i} fill={`url(#${gradId})`} stroke={d.fill} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 12, padding: '10px 14px', background: isHighDrag ? T.amberLight : T.greenLight, borderRadius: 8, fontSize: 12, color: isHighDrag ? '#92400E' : '#065F46', fontWeight: 600, fontFamily: T.sans }}>
        {isHighDrag ? '⚠️' : '✓'} Fee drag: <strong>{drag.toFixed(1)}%</strong> — {isHighDrag ? 'Above market; scrutinize fee terms vs. ILPA standards' : 'Within normal range for strategy'}
      </div>
    </div>
  )
}

// ── J-curve cashflow area chart ───────────────────────────────────────────────
function JCurveChart({ cashflows }: { cashflows: any[] }) {
  if (!cashflows.length) return null

  let cumulative = 0
  const data = cashflows
    .slice(0, 16)
    .sort((a, b) => new Date(a.cashflow_date).getTime() - new Date(b.cashflow_date).getTime())
    .map(cf => {
      const amount = cf.cashflow_type === 'Capital Call' ? -cf.amount_mm : cf.amount_mm
      cumulative += amount
      return {
        date: new Date(cf.cashflow_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        cumulative: parseFloat(cumulative.toFixed(2)),
        period: amount,
      }
    })

  return (
    <div style={{ ...sec, gridColumn: '1 / -1' }}>
      <div style={secTitle}>J-Curve — Cumulative Net Cashflow ($M)</div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="greenGradJcurve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.green} stopOpacity={0.25} />
              <stop offset="95%" stopColor={T.green} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="redGradJcurve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.red} stopOpacity={0.15} />
              <stop offset="95%" stopColor={T.red} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="blueLineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.blue} stopOpacity={1} />
              <stop offset="100%" stopColor={T.blueMid} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.textLight, fontFamily: T.sans }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke={T.slate} strokeDasharray="5 3" strokeWidth={1} />
          <Bar dataKey="period" name="Period CF" radius={[3, 3, 0, 0]} strokeWidth={1}>
            {data.map((d, i) => (
              <Cell 
                key={i} 
                fill={d.period >= 0 ? 'url(#greenGradJcurve)' : 'url(#redGradJcurve)'}
                stroke={d.period >= 0 ? T.green : T.red}
              />
            ))}
          </Bar>
          <Line 
            type="monotone" 
            dataKey="cumulative" 
            stroke={T.blue}
            strokeWidth={3}
            dot={{ r: 4, fill: T.blue, strokeWidth: 2, stroke: T.surface }}
            activeDot={{ r: 5, strokeWidth: 1 }}
            name="Cumulative" 
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Track record history grouped bar ─────────────────────────────────────────
function TrackRecordChart({ trackRecord }: { trackRecord: Record<string, string>[] }) {
  const data = trackRecord
    ?.filter(f => f.fund_name && (f.net_irr || f.tvpi))
    .map(f => ({
      name: f.fund_name?.length > 14 ? f.fund_name.slice(0, 14) + '...' : f.fund_name,
      net_irr: parseFloat(f.net_irr?.replace('%', '') || '0') || null,
      peer_median: parseFloat(f.peer_median_irr?.replace('%', '') || '0') || null,
      tvpi: parseFloat(f.tvpi || '0') || null,
    }))

  if (!data?.length) return null

  return (
    <div style={{ ...sec, gridColumn: '1 / -1' }}>
      <div style={secTitle}>Track Record — Net IRR vs Peer Median (%)</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="blueGradTR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.blue} stopOpacity={1} />
              <stop offset="100%" stopColor={T.blueMid} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="slateGradTR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.slate} stopOpacity={0.7} />
              <stop offset="100%" stopColor={T.slate} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.textMid, fontFamily: T.sans, fontWeight: 500 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: T.sans, paddingTop: 10 }} />
          <Bar dataKey="net_irr" name="Net IRR" fill="url(#blueGradTR)" radius={[5, 5, 0, 0]} stroke={T.blue} strokeWidth={1} />
          <Bar dataKey="peer_median" name="Peer Median" fill="url(#slateGradTR)" radius={[5, 5, 0, 0]} stroke={T.slate} strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RicherCharts({ facts, cashflows, scores, trackRecord }: Props) {
  if (!facts && !cashflows?.length) {
    return <div style={sec}><div style={emptyS}>No chart data available yet. Upload documents to populate.</div></div>
  }

  const grossIRR = facts?.irr_gross ? facts.irr_gross * 100 : null
  const netIRR = facts?.irr_net ? facts.irr_net * 100 : null
  const targetIRR = facts?.target_irr ? facts.target_irr * 100 : null

  // Returns comparison — grouped bar when we have multiple data points
  const returnsData = [
    netIRR != null && { name: 'Net IRR', actual: parseFloat(netIRR.toFixed(1)), target: targetIRR ? parseFloat(targetIRR.toFixed(1)) : undefined },
    grossIRR != null && { name: 'Gross IRR', actual: parseFloat(grossIRR.toFixed(1)) },
  ].filter(Boolean) as any[]

  // TVPI/DPI/RVPI
  const tvpi = facts?.tvpi
  const dpi = facts?.dpi
  const rvpi = tvpi && dpi ? parseFloat((tvpi - dpi).toFixed(2)) : null
  const multiplesData = [
    tvpi != null && { name: 'TVPI (Total)', value: parseFloat(tvpi.toFixed(2)), fill: T.green },
    dpi != null && { name: 'DPI (Realized)', value: parseFloat(dpi.toFixed(2)), fill: T.blue },
    rvpi != null && rvpi > 0 && { name: 'RVPI (Unrealized)', value: rvpi, fill: T.greenMid },
  ].filter(Boolean) as any[]

  // Capital
  const capitalData = [
    facts?.fund_size_mm != null && { name: 'Target', value: facts.fund_size_mm, fill: T.purple },
    facts?.committed_capital_mm != null && { name: 'Committed', value: facts.committed_capital_mm, fill: T.purpleMid },
    facts?.called_capital_mm != null && { name: 'Called', value: facts.called_capital_mm, fill: '#DDD6FE' },
  ].filter(Boolean) as any[]

  const hasReturns = returnsData.length >= 2 || (returnsData.length === 1 && targetIRR != null)
  const hasMultiples = multiplesData.length > 0
  const hasCapital = capitalData.length > 0
  const hasFeeDrag = grossIRR != null && netIRR != null
  const hasCashflows = cashflows?.length > 0
  const hasScores = scores && Object.keys(scores).filter(k => scores[k] != null).length > 2

  if (!hasReturns && !hasMultiples && !hasCapital && !hasFeeDrag && !hasCashflows && !hasScores) {
    return <div style={sec}><div style={emptyS}>Upload more documents with financial data to populate charts.</div></div>
  }

  return (
    <div>
      {/* Radar chart if scores available */}
      {hasScores && <ScorecardRadar scores={scores} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Returns comparison */}
        {hasReturns && (
          <div style={sec}>
            <div style={secTitle}>Returns: Actual vs Target (%)</div>
            {returnsData.length < 2 ? (
              <div style={emptyS}>Upload additional documents with target IRR to enable comparison</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={returnsData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="blueGradReturns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.blue} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.blueMid} stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="blueMidGradReturns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.blueMid} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={T.blueLight} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.textMid, fontFamily: T.sans, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: T.sans, paddingTop: 10 }} />
                  <Bar dataKey="actual" name="Actual" fill="url(#blueGradReturns)" radius={[5, 5, 0, 0]} stroke={T.blue} strokeWidth={1} />
                  {returnsData.some(d => d.target) && <Bar dataKey="target" name="Target" fill="url(#blueMidGradReturns)" radius={[5, 5, 0, 0]} stroke={T.blueMid} strokeWidth={1} />}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* TVPI/DPI/RVPI */}
        {hasMultiples && (
          <div style={sec}>
            <div style={secTitle}>Multiples: TVPI / DPI / RVPI (x)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={multiplesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="greenGradMult" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.green} stopOpacity={1} />
                    <stop offset="100%" stopColor={T.greenMid} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="blueGradMult" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.blue} stopOpacity={1} />
                    <stop offset="100%" stopColor={T.blueMid} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="greenMidGradMult" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.greenMid} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={T.greenMid} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.textMid, fontFamily: T.sans, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} unit="x" />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={1} stroke={T.slate} strokeDasharray="5 3" strokeWidth={1} label={{ value: '1.0x (Break-even)', position: 'right', fontSize: 9, fill: T.textLight }} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} name="Multiple" strokeWidth={1}>
                  {multiplesData.map((d, i) => {
                    let gradId = 'greenGradMult'
                    let strokeCol = T.green
                    if (d.fill === T.blue) { gradId = 'blueGradMult'; strokeCol = T.blue }
                    if (d.fill === T.greenMid) { gradId = 'greenMidGradMult'; strokeCol = T.greenMid }
                    return <Cell key={i} fill={`url(#${gradId})`} stroke={strokeCol} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Fee drag waterfall */}
        {hasFeeDrag && <FeeDragWaterfall grossIRR={grossIRR!} netIRR={netIRR!} />}

        {/* Capital structure */}
        {hasCapital && (
          <div style={sec}>
            <div style={secTitle}>Capital Structure ($M)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={capitalData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="purpleGradCap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.purple} stopOpacity={1} />
                    <stop offset="100%" stopColor={T.purpleMid} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="purpleMidGradCap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.purpleMid} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={T.purpleMid} stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="purpleLightGradCap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DDD6FE" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#DDD6FE" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={T.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.textMid, fontFamily: T.sans, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: T.textLight, fontFamily: T.mono }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} name="$M" strokeWidth={1}>
                  {capitalData.map((d, i) => {
                    let gradId = 'purpleGradCap'
                    let strokeCol = T.purple
                    if (d.fill === T.purpleMid) { gradId = 'purpleMidGradCap'; strokeCol = T.purpleMid }
                    if (d.fill === '#DDD6FE') { gradId = 'purpleLightGradCap'; strokeCol = '#C4B5FD' }
                    return <Cell key={i} fill={`url(#${gradId})`} stroke={strokeCol} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* J-Curve cashflow */}
        {hasCashflows && <JCurveChart cashflows={cashflows} />}

        {/* Track record */}
        {trackRecord && <TrackRecordChart trackRecord={trackRecord} />}
      </div>
    </div>
  )
}

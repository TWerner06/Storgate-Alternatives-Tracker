// components/alt/ConfirmationCheck.tsx
// Shows verified/unverified/missing status per criterion + GP data request list
'use client'

import { useState, useEffect, CSSProperties } from 'react'

const T = {
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEF2F2',
  blue: '#3B82F6', blueLight: '#EFF6FF',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const STATUS_CONFIG = {
  verified:   { color: T.green,  bg: T.greenLight, icon: '✓', label: 'Verified' },
  unverified: { color: T.amber,  bg: T.amberLight, icon: '⚠', label: 'Needs Verification' },
  missing:    { color: T.red,    bg: T.redLight,   icon: '✗', label: 'Missing' },
}

interface CriterionStatus {
  id: string
  label: string
  status: 'verified' | 'unverified' | 'missing'
  note?: string
  dataNeeded?: string
}

interface Props {
  managerId: string
  criteriaScores: Record<string, number | null>
  confidence: Record<string, 'H' | 'M' | 'L' | null>
  criteria: any[]
}

export default function ConfirmationCheck({ managerId, criteriaScores, confidence, criteria }: Props) {
  const [overrides, setOverrides] = useState<Record<string, 'verified' | 'unverified' | 'missing'>>({})
  const [copied, setCopied] = useState(false)

  // Derive status from score + confidence
  function getStatus(criterionId: string): 'verified' | 'unverified' | 'missing' {
    if (overrides[criterionId]) return overrides[criterionId]
    const score = criteriaScores[criterionId]
    const conf = confidence[criterionId]
    if (score == null) return 'missing'
    if (conf === 'H') return 'verified'
    if (conf === 'M') return 'unverified'
    if (conf === 'L') return 'unverified'
    return 'unverified'
  }

  const statuses = criteria.map(c => ({
    id: c.id,
    label: c.label,
    status: getStatus(c.id),
    guidance: c.guidance || c.what_to_look_for || '',
  }))

  const verified = statuses.filter(s => s.status === 'verified')
  const unverified = statuses.filter(s => s.status === 'unverified')
  const missing = statuses.filter(s => s.status === 'missing')

  const completionPct = Math.round((verified.length / Math.max(criteria.length, 1)) * 100)

  // GP data request list
  const gpRequestItems = [
    ...missing.map(s => ({ label: s.label, priority: 'Required', reason: 'No data found in uploaded documents' })),
    ...unverified.map(s => ({ label: s.label, priority: 'Recommended', reason: 'Partial data available — confirmation needed' })),
  ]

  function generateGPRequest() {
    const text = `DATA REQUEST — ${new Date().toLocaleDateString()}\n\nTo complete our underwriting, please provide the following:\n\nREQUIRED (${missing.length} items):\n${missing.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}\n\nRECOMMENDED FOR VERIFICATION (${unverified.length} items):\n${unverified.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 14 }
  const secTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }

  return (
    <div>
      {/* Summary */}
      <div style={sec}>
        <div style={secTitle}>Data Verification Status</div>
        {/* Progress bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Scorecard Completeness</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: completionPct >= 80 ? T.green : completionPct >= 50 ? T.amber : T.red, fontFamily: T.mono }}>{completionPct}%</span>
          </div>
          <div style={{ background: T.bg, borderRadius: 6, height: 10, overflow: 'hidden' }}>
            <div style={{ width: `${completionPct}%`, background: completionPct >= 80 ? T.green : completionPct >= 50 ? T.amber : T.red, height: '100%', borderRadius: 6, transition: 'width .5s' }} />
          </div>
        </div>
        {/* Status counts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            { key: 'verified', count: verified.length, ...STATUS_CONFIG.verified },
            { key: 'unverified', count: unverified.length, ...STATUS_CONFIG.unverified },
            { key: 'missing', count: missing.length, ...STATUS_CONFIG.missing },
          ].map(s => (
            <div key={s.key} style={{ background: s.bg, borderRadius: 8, padding: '10px 14px', border: `1px solid ${s.color}33`, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: T.mono }}>{s.count}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginTop: 2 }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Criterion-level status */}
      <div style={sec}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
          <div style={secTitle as CSSProperties}>Criterion Detail</div>
          <div style={{ fontSize: 10, color: T.textLight }}>Click status to override</div>
        </div>
        {statuses.map(s => {
          const statusCfg = STATUS_CONFIG[s.status]
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 7, marginBottom: 6, background: s.status === 'missing' ? T.redLight : s.status === 'unverified' ? T.amberLight : '#FAFBFD', border: `1px solid ${s.status === 'missing' ? T.red + '33' : s.status === 'unverified' ? T.amber + '33' : T.border}` }}>
              <button
                onClick={() => {
                  const cycle: Record<string, 'verified' | 'unverified' | 'missing'> = { verified: 'unverified', unverified: 'missing', missing: 'verified' }
                  setOverrides(p => ({ ...p, [s.id]: cycle[s.status] }))
                }}
                style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${statusCfg.color}`, background: statusCfg.bg, color: statusCfg.color, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                {statusCfg.icon}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{s.label}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: statusCfg.color, background: statusCfg.bg, padding: '2px 8px', borderRadius: 10, border: `1px solid ${statusCfg.color}33`, flexShrink: 0 }}>
                {statusCfg.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* GP Data Request */}
      {gpRequestItems.length > 0 && (
        <div style={sec}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
            <div style={secTitle as CSSProperties}>GP Data Request List</div>
            <button onClick={generateGPRequest} style={{ padding: '6px 14px', background: copied ? T.green : T.text, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {copied ? '✓ Copied' : '⎘ Copy Request'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: T.textLight, marginBottom: 12 }}>
            Send this list to the GP to complete your underwriting. {missing.length} required, {unverified.length} recommended.
          </div>
          {missing.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Required — No Data Found</div>
              {missing.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', gap: 10, marginBottom: 6, padding: '8px 12px', background: T.redLight, borderRadius: 6, border: `1px solid ${T.red}22` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.red, minWidth: 20, fontFamily: T.mono }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: '#991B1B' }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {unverified.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Recommended — Please Confirm</div>
              {unverified.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', gap: 10, marginBottom: 6, padding: '8px 12px', background: T.amberLight, borderRadius: 6, border: `1px solid ${T.amber}22` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, minWidth: 20, fontFamily: T.mono }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: '#92400E' }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {completionPct === 100 && (
        <div style={{ ...sec, background: T.greenLight, borderColor: T.green + '44', textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>All criteria verified — scorecard complete</div>
        </div>
      )}
    </div>
  )
}

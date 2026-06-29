// components/alt/Stage2Scorecard.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadScores, saveScores } from '@/lib/supabase'
import { STAGE2_CONFIG, STAGE2_WEIGHTS, ASSET_CLASS_TO_STRATEGY, FUND_TERMS_CONFIG, TRACK_RECORD_FIELDS, getRecommendation, calcWeightedComposite, SCALE_GUIDE } from '@/lib/alt-scoring'

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEF2F2',
  purple: '#8B5CF6', purpleLight: '#F5F3FF',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const SCORE_COLORS: Record<number, string> = { 1: '#EF4444', 2: '#F59E0B', 3: '#3B82F6', 4: '#10B981', 5: '#059669' }
const CONF_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  H: { color: '#059669', bg: '#ECFDF5', label: 'High' },
  M: { color: '#F59E0B', bg: '#FFFBEB', label: 'Medium' },
  L: { color: '#EF4444', bg: '#FEF2F2', label: 'Low' },
}

const PILLAR_COLORS: Record<string, string> = {
  quant: '#3B82F6',
  risk: '#EF4444',
  process: '#8B5CF6',
  org: '#10B981',
}

const PILLAR_LABELS: Record<string, string> = {
  quant: 'Quantitative Performance',
  risk: 'Risk & Portfolio Construction',
  process: 'Process & Philosophy',
  org: 'Organizational & People',
}

interface Props {
  manager: any
  onSave?: () => void
}

export default function Stage2Scorecard({ manager, onSave }: Props) {
  const strategy = ASSET_CLASS_TO_STRATEGY[manager.asset_class] || 'Buyout'
  const config = STAGE2_CONFIG[strategy]
  const weights = STAGE2_WEIGHTS[strategy] || { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 }

  const [activeSection, setActiveSection] = useState<'scorecard' | 'terms' | 'track_record'>('scorecard')
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number | null>>({})
  const [confidence, setConfidence] = useState<Record<string, 'H' | 'M' | 'L' | null>>({})
  const [analystNotes, setAnalystNotes] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({})
  const [termsScores, setTermsScores] = useState<Record<string, number | null>>({})
  const [trackRecord, setTrackRecord] = useState<Record<string, string>[]>([{}, {}, {}, {}, {}])
  const [saving, setSaving] = useState(false)
  const [aiScoring, setAiScoring] = useState(false)
  const [saved, setSaved] = useState(false)

  // Calculate section averages
  const sectionAvgs: Record<string, number | null> = {}
  if (config?.sections) {
    for (const [sectionId, section] of Object.entries(config.sections) as any) {
      const vals = section.criteria
        .map((c: any) => criteriaScores[c.id])
        .filter((v: any) => v != null) as number[]
      sectionAvgs[sectionId] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
  }

  const weightedComposite = calcWeightedComposite(sectionAvgs, weights)
  const recommendation = weightedComposite ? getRecommendation(weightedComposite) : null

  async function handleAiScore() {
    setAiScoring(true)
    try {
      const res = await fetch('/api/alt/score-stage2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: manager.id, assetClass: manager.asset_class, strategy }),
      })
      const data = await res.json()
      if (data.criteriaScores) setCriteriaScores(data.criteriaScores)
      if (data.confidence) setConfidence(data.confidence)
      if (data.flags) setFlags(data.flags)
      if (data.flagReasons) setFlagReasons(data.flagReasons)
    } catch (err) { console.error(err) }
    finally { setAiScoring(false) }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      await sb.from('alt_scores_stage2').upsert({
        manager_id: manager.id,
        strategy,
        section_scores: sectionAvgs,
        section_criteria_scores: criteriaScores,
        confidence_levels: confidence,
        analyst_notes: analystNotes,
        flags,
        flag_reasons: flagReasons,
        terms_scores: termsScores,
        track_record: trackRecord,
        composite_score: weightedComposite,
        weighted_composite: weightedComposite,
        recommendation: recommendation?.label || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'manager_id' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave?.()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }
  const secTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }
  const scoreBtn = (active: boolean, score: number): CSSProperties => ({
    width: 34, height: 34, borderRadius: 6,
    border: `1.5px solid ${active ? SCORE_COLORS[score] : T.border}`,
    background: active ? SCORE_COLORS[score] : T.surface,
    color: active ? '#fff' : T.textLight,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .1s',
    fontFamily: T.mono,
  })
  const confBtn = (active: boolean, level: string): CSSProperties => ({
    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? CONF_COLORS[level].color : T.border}`,
    background: active ? CONF_COLORS[level].bg : T.surface,
    color: active ? CONF_COLORS[level].color : T.textLight,
  })

  if (!config) return (
    <div style={{ textAlign: 'center', padding: '40px', color: T.textLight }}>
      No Stage 2 scorecard configured for {strategy} yet.
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ ...sec, borderLeft: `4px solid ${T.blue}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Stage 2 — Full Underwriting</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: '-.02em' }}>{config.label}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAiScore} disabled={aiScoring} style={{ padding: '7px 16px', background: aiScoring ? T.bg : T.blue, color: aiScoring ? T.textLight : '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: aiScoring ? 'not-allowed' : 'pointer' }}>
              {aiScoring ? '⏳ Scoring...' : '✦ AI Score'}
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', background: saved ? T.green : saving ? T.bg : T.text, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {saved ? '✓ Saved' : saving ? 'Saving...' : '↓ Save'}
            </button>
          </div>
        </div>

        {/* Pillar weights */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {Object.entries(weights).map(([pillar, weight]) => {
            const avg = sectionAvgs[pillar]
            return (
              <div key={pillar} style={{ background: T.bg, borderRadius: 8, padding: '10px 12px', borderTop: `3px solid ${PILLAR_COLORS[pillar]}` }}>
                <div style={{ fontSize: 9, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: T.mono, marginBottom: 4 }}>{PILLAR_LABELS[pillar]}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: avg != null ? PILLAR_COLORS[pillar] : T.textLight, fontFamily: T.mono }}>
                    {avg != null ? avg.toFixed(2) : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: T.textLight, fontFamily: T.mono }}>{(weight * 100).toFixed(0)}% wt</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Composite */}
        {weightedComposite != null && recommendation && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: recommendation.color + '10', borderRadius: 8, border: `1px solid ${recommendation.color}33`, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: recommendation.color, fontFamily: T.mono, lineHeight: 1 }}>{weightedComposite.toFixed(2)}</div>
              <div style={{ fontSize: 9, color: T.textLight, textTransform: 'uppercase', marginTop: 2 }}>weighted</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: recommendation.color, marginBottom: 3 }}>{recommendation.label}</div>
              <div style={{ fontSize: 12, color: T.textMid }}>{recommendation.action}</div>
            </div>
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 16, background: T.surface, borderRadius: '10px 10px 0 0', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        {[['scorecard', 'Scorecard'], ['terms', 'Fund Terms'], ['track_record', 'Track Record']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveSection(id as any)} style={{ padding: '0 20px', height: 42, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: activeSection === id ? 700 : 400, color: activeSection === id ? T.text : T.textLight, borderBottom: activeSection === id ? `2px solid ${T.blue}` : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* SCORECARD SECTION */}
      {activeSection === 'scorecard' && (
        <>
          {/* Scale guide */}
          <div style={{ ...sec, padding: '10px 20px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: T.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Scale:</span>
              {SCALE_GUIDE.map(s => (
                <div key={s.score} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: SCORE_COLORS[s.score], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 10 }}>{s.score}</div>
                  <span style={{ color: T.textMid }}>{s.label}</span>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: T.textLight, fontWeight: 600 }}>Confidence:</span>
                {['H', 'M', 'L'].map(l => (
                  <span key={l} style={{ fontSize: 10, fontWeight: 600, color: CONF_COLORS[l].color, background: CONF_COLORS[l].bg, padding: '2px 7px', borderRadius: 4 }}>{CONF_COLORS[l].label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Pillars */}
          {Object.entries(config.sections).map(([pillarId, pillar]: any) => (
            <div key={pillarId} style={sec}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${PILLAR_COLORS[pillarId]}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 20, background: PILLAR_COLORS[pillarId], borderRadius: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: '-.01em' }}>{pillar.label}</div>
                    {pillar.note && <div style={{ fontSize: 11, color: T.textLight, marginTop: 2 }}>{pillar.note}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: T.textLight, marginBottom: 2 }}>{(weights[pillarId] * 100).toFixed(0)}% of composite</div>
                  {sectionAvgs[pillarId] != null && (
                    <div style={{ fontSize: 16, fontWeight: 800, color: PILLAR_COLORS[pillarId], fontFamily: T.mono }}>{sectionAvgs[pillarId]!.toFixed(2)}</div>
                  )}
                </div>
              </div>

              {pillar.criteria.map((criterion: any) => (
                <div key={criterion.id} style={{ marginBottom: 12, padding: '12px 14px', background: '#FAFBFD', borderRadius: 9, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>{criterion.label}</div>
                      {criterion.guidance && (
                        <div style={{ fontSize: 11, color: T.textLight, lineHeight: 1.5, background: T.bg, padding: '6px 10px', borderRadius: 5, marginTop: 4 }}>
                          {criterion.guidance}
                        </div>
                      )}
                    </div>
                    {/* Confidence */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                      <div style={{ fontSize: 9, color: T.textLight, textTransform: 'uppercase', letterSpacing: '.05em' }}>Confidence</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['H', 'M', 'L'].map(l => (
                          <button key={l} onClick={() => setConfidence(p => ({ ...p, [criterion.id]: p[criterion.id] === l ? null : l as any }))} style={confBtn(confidence[criterion.id] === l, l)}>{l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Score buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[1, 2, 3, 4, 5].map(score => (
                        <button key={score} onClick={() => setCriteriaScores(p => ({ ...p, [criterion.id]: p[criterion.id] === score ? null : score }))} style={scoreBtn(criteriaScores[criterion.id] === score, score)}>{score}</button>
                      ))}
                    </div>
                    <input
                      placeholder="Analyst note..."
                      value={analystNotes[criterion.id] || ''}
                      onChange={e => setAnalystNotes(p => ({ ...p, [criterion.id]: e.target.value }))}
                      style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, outline: 'none', color: T.text, background: T.surface, fontFamily: T.sans }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Red flags */}
          {config.flags?.length > 0 && (
            <div style={sec}>
              <div style={secTitle}>⚠ Red Flags</div>
              {config.flags.map((flag: any) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, padding: '11px 14px', background: flags[flag.id] ? T.redLight : '#FAFBFD', borderRadius: 8, border: `1px solid ${flags[flag.id] ? T.red + '44' : T.border}` }}>
                  <input type="checkbox" checked={flags[flag.id] || false} onChange={e => setFlags(p => ({ ...p, [flag.id]: e.target.checked }))} style={{ width: 15, height: 15, cursor: 'pointer', marginTop: 2, accentColor: T.red }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, color: flags[flag.id] ? '#991B1B' : T.text, fontWeight: flags[flag.id] ? 700 : 500 }}>{flag.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: flag.severity === 'H' ? T.redLight : flag.severity === 'M' ? T.amberLight : T.blueLight, color: flag.severity === 'H' ? T.red : flag.severity === 'M' ? T.amber : T.blue }}>
                        {flag.severity === 'H' ? 'High' : flag.severity === 'M' ? 'Medium' : 'Low'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: T.textLight }}>{flag.description}</div>
                    {flags[flag.id] && (
                      <input placeholder="Reason / evidence..." value={flagReasons[flag.id] || ''} onChange={e => setFlagReasons(p => ({ ...p, [flag.id]: e.target.value }))} style={{ marginTop: 6, width: '100%', padding: '6px 10px', border: `1px solid ${T.red}44`, borderRadius: 5, fontSize: 12, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
                    )}
                  </div>
                </div>
              ))}
              {Object.values(flags).some(Boolean) && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: T.redLight, borderRadius: 7, fontSize: 12, color: '#991B1B', fontWeight: 600, border: `1px solid ${T.red}44` }}>
                  ⚠ {Object.values(flags).filter(Boolean).length} flag(s) active — automatic watch-list review triggered
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* FUND TERMS SECTION */}
      {activeSection === 'terms' && (
        <div style={sec}>
          <div style={secTitle}>Fund Terms & Alignment — vs. ILPA Principles 3.0</div>
          <div style={{ fontSize: 12, color: T.textLight, marginBottom: 16, padding: '10px 14px', background: T.bg, borderRadius: 7 }}>
            Score each term vs. ILPA market standards: <strong>1</strong> = LP-unfavorable | <strong>3</strong> = Market standard | <strong>5</strong> = LP-favorable best practice
          </div>
          {Object.entries(FUND_TERMS_CONFIG.sections).map(([sectionId, section]: any) => (
            <div key={sectionId} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${T.blueLight}` }}>
                {section.label}
              </div>
              {section.criteria.map((criterion: any) => (
                <div key={criterion.id} style={{ marginBottom: 10, padding: '10px 14px', background: '#FAFBFD', borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{criterion.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: criterion.priority === 'H' ? T.redLight : criterion.priority === 'M' ? T.amberLight : T.blueLight, color: criterion.priority === 'H' ? T.red : criterion.priority === 'M' ? T.amber : T.blue }}>
                          {criterion.priority === 'H' ? 'High' : criterion.priority === 'M' ? 'Medium' : 'Low'} Priority
                        </span>
                      </div>
                      {criterion.guidance && <div style={{ fontSize: 11, color: T.textLight, marginTop: 4, lineHeight: 1.5 }}>{criterion.guidance}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {[1, 2, 3, 4, 5].map(score => (
                        <button key={score} onClick={() => setTermsScores(p => ({ ...p, [criterion.id]: p[criterion.id] === score ? null : score }))} style={scoreBtn(termsScores[criterion.id] === score, score)}>{score}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* TRACK RECORD SECTION */}
      {activeSection === 'track_record' && (
        <div style={sec}>
          <div style={secTitle}>Track Record History (up to 5 prior funds)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: T.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                    Metric
                  </th>
                  {[1, 2, 3, 4, 5].map(i => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, color: T.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                      Fund {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRACK_RECORD_FIELDS.map((field, i) => (
                  <tr key={field.id} style={{ background: i % 2 === 0 ? T.surface : '#FAFBFD' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: T.textMid, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', fontSize: 11 }}>
                      {field.label}
                    </td>
                    {[0, 1, 2, 3, 4].map(fi => (
                      <td key={fi} style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, textAlign: 'center' }}>
                        <input
                          value={trackRecord[fi]?.[field.id] || ''}
                          onChange={e => {
                            const updated = [...trackRecord]
                            updated[fi] = { ...updated[fi], [field.id]: e.target.value }
                            setTrackRecord(updated)
                          }}
                          style={{ width: '100%', padding: '4px 6px', border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 11, outline: 'none', textAlign: 'center', fontFamily: T.mono, color: T.text, background: 'transparent' }}
                          placeholder="—"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

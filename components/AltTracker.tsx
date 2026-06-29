// components/AltTracker.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadManagers, updateManagerStatus, loadScores } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'
import AiAssistant from './alt/AiAssistant'
import Dashboard from './alt/Dashboard'

const ASSET_CLASSES = [
  { id: 'Private Equity', icon: '◈' },
  { id: 'Private Credit', icon: '◆' },
  { id: 'Hedge Funds', icon: '◇' },
  { id: 'Managed Futures', icon: '▲' },
  { id: 'Private Real Estate', icon: '⬡' },
  { id: 'Energy', icon: '◉' },
  { id: 'Crypto Assets', icon: '◎' },
  { id: 'Opportunistic', icon: '◐' },
]

const PIPELINE_STAGES = [
  { id: 'tracking',       label: 'Tracking',       color: '#94A3B8', bg: '#F1F5F9' },
  { id: 'near_investing', label: 'Near Investing',  color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'investing',      label: 'Investing',       color: '#10B981', bg: '#ECFDF5' },
  { id: 'pass',           label: 'Pass',            color: '#EF4444', bg: '#FEF2F2' },
]

const T = {
  navy: '#0B1929', navyLight: '#132338', navyBorder: 'rgba(255,255,255,0.07)',
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', amber: '#F59E0B', red: '#EF4444', slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

type MainView = 'dashboard' | 'list' | 'detail' | 'upload' | 'ai' | 'market_research'

export default function AltTracker() {
  const [managers, setManagers] = useState<any[]>([])
  const [scores, setScores] = useState<Record<string, any>>({})
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [view, setView] = useState<MainView>('dashboard')
  const [viewMode, setViewMode] = useState<'asset' | 'pipeline'>('asset')
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data } = await loadManagers()
      const mgrs = data || []
      setManagers(mgrs)
      // Load scores for all managers
      const scoreMap: Record<string, any> = {}
      await Promise.all(mgrs.map(async m => {
        const { data: s } = await loadScores(m.id)
        if (s) scoreMap[m.id] = s
      }))
      setScores(scoreMap)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleSelect = (m: any) => { setSelectedManager(m); setView('detail') }
  const handleUploadDone = () => { loadAll(); setView('list') }
  const handleStatusChange = async (id: string, status: string) => {
    await updateManagerStatus(id, status)
    setManagers(prev => prev.map(m => m.id === id ? { ...m, pipeline_status: status } : m))
  }

  const filtered = managers.filter(m => m.asset_class === selectedAssetClass)
  const countByClass = (ac: string) => managers.filter(m => m.asset_class === ac).length
  const countByStage = (s: string) => managers.filter(m => m.pipeline_status === s).length
  const SW = collapsed ? 58 : 220

  // Nav item
  const navItem = (active: boolean, onClick: () => void, icon: string, label: string, badge?: number) => (
    <button key={label} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: collapsed ? '9px 0' : '9px 14px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      width: '100%', border: 'none', cursor: 'pointer',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      borderLeft: active ? `2px solid ${T.blue}` : '2px solid transparent',
      marginBottom: 1, transition: 'all .1s',
    }}>
      <span style={{ fontSize: 13, color: active ? T.blue : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{icon}</span>
      {!collapsed && <>
        <span style={{ fontSize: 12, color: active ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: active ? 600 : 400, flex: 1, textAlign: 'left', fontFamily: T.sans }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: active ? T.blue : 'rgba(255,255,255,0.25)', fontFamily: T.mono, background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8, minWidth: 20, textAlign: 'center' }}>
          {badge ?? 0}
        </span>
      </>}
    </button>
  )

  // Kanban
  function KanbanBoard() {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {PIPELINE_STAGES.map(s => (
            <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.mono }}>{countByStage(s.id)}</div>
              <div style={{ fontSize: 11, color: T.textMid, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {PIPELINE_STAGES.map(stage => {
            const funds = managers.filter(m => m.pipeline_status === stage.id)
            return (
              <div key={stage.id} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{stage.label}</span>
                  </div>
                  <span style={{ fontSize: 11, color: T.textLight, fontFamily: T.mono, fontWeight: 700 }}>{funds.length}</span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
                  {funds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: T.textLight, fontSize: 11 }}>No funds</div>
                  ) : funds.map(m => {
                    const score = scores[m.id]?.composite_score
                    return (
                      <div key={m.id} onClick={() => handleSelect(m)}
                        style={{ background: '#FAFBFC', border: `1px solid ${T.border}`, borderRadius: 7, padding: '10px 11px', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.background = T.blueLight }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = '#FAFBFC' }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>{m.fund_name}</div>
                        <div style={{ fontSize: 11, color: T.textMid, marginBottom: 7 }}>{m.manager_name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: T.textLight, background: T.bg, padding: '2px 7px', borderRadius: 4, fontFamily: T.mono }}>{m.asset_class}</span>
                          {score && <span style={{ fontSize: 11, fontWeight: 700, color: score >= 4 ? T.green : score >= 3 ? T.blue : T.amber, fontFamily: T.mono }}>{score.toFixed(2)} ★</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 7 }} onClick={e => e.stopPropagation()}>
                          {PIPELINE_STAGES.filter(s => s.id !== stage.id).map(s => (
                            <button key={s.id} onClick={() => handleStatusChange(m.id, s.id)}
                              style={{ flex: 1, padding: '3px 0', fontSize: 9, background: '#fff', border: `1px solid ${s.color}44`, color: s.color, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                              {s.label.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function TopBar() {
    return (
      <div style={{ height: 50, background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMid }}>
          {(view === 'detail' || view === 'upload' || view === 'ai') && (
            <><span onClick={() => setView('dashboard')} style={{ color: T.blue, cursor: 'pointer', fontWeight: 500 }}>Home</span><span style={{ color: T.textLight }}>/</span></>
          )}
          <span style={{ fontWeight: 600, color: T.text }}>
            {view === 'detail' ? selectedManager?.fund_name : view === 'upload' ? 'Upload Document' : view === 'ai' ? 'AI Assistant' : view === 'dashboard' ? 'Dashboard' : viewMode === 'pipeline' ? 'Pipeline' : selectedAssetClass}
          </span>
        </div>
        {view === 'list' && (
          <div style={{ display: 'flex', background: T.bg, borderRadius: 7, padding: 2, gap: 2 }}>
            {[['asset','By Class'],['pipeline','Pipeline']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v as any)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: viewMode === v ? T.surface : 'transparent', color: viewMode === v ? T.text : T.textLight, fontSize: 11, fontWeight: viewMode === v ? 600 : 400, cursor: 'pointer', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: T.sans }}>
                {l}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setView('upload')} style={{ padding: '7px 16px', background: T.blue, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
          + Upload
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: T.sans, color: T.text, background: T.bg, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: SW, minWidth: SW, background: T.navy, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.navyBorder}`, transition: 'width .2s', overflow: 'hidden', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '16px 0' : '16px', borderBottom: `1px solid ${T.navyBorder}`, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-.02em' }}>Storgate</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Alternatives</div>
              </div>
            </div>
          )}
          {collapsed && <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>}
          {!collapsed && <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 16, padding: 4 }}>‹</button>}
        </div>
        {collapsed && <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 16, padding: '8px 0', width: '100%' }}>›</button>}

        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
          {/* Portfolio section */}
          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Portfolio</div>}
          {!collapsed ? (
            <>
              {navItem(view === 'dashboard', () => setView('dashboard'), '⬛', 'Dashboard', managers.length)}
              {navItem(view === 'ai', () => setView('ai'), '✦', 'AI Assistant')}
            </>
          ) : (
            <>
              <button onClick={() => setView('dashboard')} style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '9px 0', border: 'none', background: view === 'dashboard' ? 'rgba(59,130,246,0.15)' : 'transparent', cursor: 'pointer', borderLeft: view === 'dashboard' ? `2px solid ${T.blue}` : '2px solid transparent' }}>
                <span style={{ color: view === 'dashboard' ? T.blue : 'rgba(255,255,255,0.35)', fontSize: 13 }}>⬛</span>
              </button>
              <button onClick={() => setView('ai')} style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '9px 0', border: 'none', background: view === 'ai' ? 'rgba(59,130,246,0.15)' : 'transparent', cursor: 'pointer', borderLeft: view === 'ai' ? `2px solid ${T.blue}` : '2px solid transparent' }}>
                <span style={{ color: view === 'ai' ? T.blue : 'rgba(255,255,255,0.35)', fontSize: 13 }}>✦</span>
              </button>
            </>
          )}

          {/* Asset classes */}
          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Asset Classes</div>}
          {!collapsed && <div style={{ height: 8 }} />}
          {ASSET_CLASSES.map(ac => navItem(
            view === 'list' && viewMode === 'asset' && selectedAssetClass === ac.id,
            () => { setSelectedAssetClass(ac.id); setViewMode('asset'); setView('list') },
            ac.icon, ac.id, countByClass(ac.id)
          ))}

          {/* Pipeline */}
          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Pipeline</div>}
          {navItem(view === 'list' && viewMode === 'pipeline', () => { setViewMode('pipeline'); setView('list') }, '⬡', 'Kanban Board', managers.length)}
          {!collapsed && PIPELINE_STAGES.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px 5px 16px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', fontFamily: T.mono }}>{countByStage(s.id)}</span>
            </div>
          ))}

          {/* Market Research */}
          {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px' }}>Research</div>}
          {navItem(view === 'market_research', () => setView('market_research'), '◎', 'Market Research')}
        </div>

        {!collapsed && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.navyBorder}` }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', textAlign: 'center', letterSpacing: '.05em' }}>{managers.length} fund{managers.length !== 1 ? 's' : ''} tracked</div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: view === 'ai' ? 0 : '20px 24px' }}>
          {loading && <div style={{ textAlign: 'center', color: T.textLight, padding: '80px 0' }}>Loading...</div>}
          {!loading && view === 'market_research' && <div style={{ textAlign: 'center', padding: '80px', color: T.textLight }}><div style={{ fontSize: 32, marginBottom: 16, opacity: 0.3 }}>◎</div><div style={{ fontSize: 16, fontWeight: 600, color: T.textMid, marginBottom: 8 }}>Market Research</div><div style={{ fontSize: 13, color: T.textLight }}>Upload benchmark reports, sector research, and macro docs — coming in Chunk 4</div></div>}
          {!loading && view === 'dashboard' && <Dashboard managers={managers} scores={scores} onSelectManager={handleSelect} onSelectAssetClass={(ac) => { setSelectedAssetClass(ac); setViewMode('asset'); setView('list') }} />}
          {!loading && view === 'upload' && <DocumentUpload onUploadComplete={handleUploadDone} />}
          {!loading && view === 'ai' && <div style={{ height: '100%' }}><AiAssistant /></div>}
          {!loading && view === 'list' && viewMode === 'asset' && <ManagerList managers={filtered} assetClass={selectedAssetClass} scores={scores} onSelectManager={handleSelect} onUploadClick={() => setView('upload')} />}
          {!loading && view === 'list' && viewMode === 'pipeline' && <KanbanBoard />}
          {!loading && view === 'detail' && selectedManager && <ManagerDetail manager={selectedManager} onBack={() => { setSelectedManager(null); setView('list') }} onStatusChange={handleStatusChange} />}
        </div>
      </div>
    </div>
  )
}

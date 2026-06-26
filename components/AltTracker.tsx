// components/AltTracker.tsx — Full redesign with sidebar layout
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadManagers, updateManagerStatus } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'
import AiAssistant from './alt/AiAssistant'

const ASSET_CLASSES = [
  { id: 'Private Equity', icon: '◈' },
  { id: 'Private Credit', icon: '◆' },
  { id: 'Hedge Funds', icon: '◇' },
  { id: 'Managed Futures', icon: '▲' },
  { id: 'Private Real Estate', icon: '⬡' },
  { id: 'Energy', icon: '◉' },
  { id: 'Crypto Assets', icon: '◎' },
  { id: 'Opportunistic', icon: '◐' },
  { id: 'Research', icon: '◑' },
]

const PIPELINE_STAGES = [
  { id: 'tracking', label: 'Tracking', color: '#6B7FA3' },
  { id: 'near_investing', label: 'Near Investing', color: '#F59E0B' },
  { id: 'investing', label: 'Investing', color: '#10B981' },
  { id: 'pass', label: 'Pass', color: '#94A3B8' },
]

type ViewMode = 'asset' | 'pipeline'
type MainView = 'list' | 'detail' | 'upload' | 'ai'

export default function AltTracker() {
  const [managers, setManagers] = useState<any[]>([])
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [view, setView] = useState<MainView>('list')
  const [viewMode, setViewMode] = useState<ViewMode>('asset')
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => { loadAllManagers() }, [])

  async function loadAllManagers() {
    setLoading(true)
    try {
      const { data } = await loadManagers()
      setManagers(data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleManagerSelect = (manager: any) => { setSelectedManager(manager); setView('detail') }
  const handleUploadComplete = () => { loadAllManagers(); setView('list') }
  const handleStatusChange = async (id: string, status: string) => {
    await updateManagerStatus(id, status)
    setManagers(prev => prev.map(m => m.id === id ? { ...m, pipeline_status: status } : m))
  }

  const countByClass = (ac: string) => managers.filter(m => m.asset_class === ac).length
  const countByStage = (s: string) => managers.filter(m => m.pipeline_status === s).length
  const filteredManagers = managers.filter(m => m.asset_class === selectedAssetClass)

  // ── Design tokens ──────────────────────────────────────────────────────
  const T = {
    navy: '#0B1929',
    navyLight: '#132338',
    navyBorder: 'rgba(255,255,255,0.07)',
    blue: '#3B82F6',
    blueLight: '#EFF6FF',
    green: '#10B981',
    greenLight: '#ECFDF5',
    amber: '#F59E0B',
    amberLight: '#FFFBEB',
    red: '#F87171',
    redLight: '#FEF2F2',
    slate: '#94A3B8',
    bg: '#F1F5F9',
    surface: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    textMid: '#475569',
    textLight: '#94A3B8',
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    sans: "'Inter', system-ui, -apple-system, sans-serif",
  }

  // Sidebar width
  const SW = sidebarCollapsed ? 60 : 220

  // ── Sidebar ─────────────────────────────────────────────────────────────
  const sidebar: CSSProperties = {
    width: SW,
    minWidth: SW,
    background: T.navy,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${T.navyBorder}`,
    transition: 'width .2s ease',
    overflow: 'hidden',
    flexShrink: 0,
  }

  const sidebarTop: CSSProperties = {
    padding: sidebarCollapsed ? '18px 0' : '18px 16px',
    borderBottom: `1px solid ${T.navyBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: sidebarCollapsed ? 'center' : 'space-between',
  }

  const navSection = (label: string) => !sidebarCollapsed ? (
    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '16px 16px 6px', fontFamily: T.sans }}>
      {label}
    </div>
  ) : <div style={{ height: 16 }} />

  const navItem = (active: boolean, onClick: () => void, icon: string, label: string, badge?: number): React.ReactNode => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: sidebarCollapsed ? '9px 0' : '9px 14px',
      justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
      width: '100%', border: 'none', cursor: 'pointer',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      borderLeft: active ? `2px solid ${T.blue}` : '2px solid transparent',
      borderRadius: active ? '0 6px 6px 0' : 0,
      transition: 'all .1s',
      marginBottom: 1,
    }}>
      <span style={{ fontSize: 13, color: active ? T.blue : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{icon}</span>
      {!sidebarCollapsed && (
        <>
          <span style={{ fontSize: 12, color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: active ? 600 : 400, flex: 1, textAlign: 'left', letterSpacing: '-.01em', fontFamily: T.sans }}>
            {label}
          </span>
          {badge !== undefined && badge > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: active ? T.blue : 'rgba(255,255,255,0.3)', fontFamily: T.mono, background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8 }}>
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  )

  // ── Kanban ───────────────────────────────────────────────────────────────
  function KanbanBoard() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
        {PIPELINE_STAGES.map(stage => {
          const funds = managers.filter(m => m.pipeline_status === stage.id)
          return (
            <div key={stage.id} style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: '-.01em', fontFamily: T.sans }}>{stage.label}</span>
                </div>
                <span style={{ fontSize: 11, color: T.textLight, fontFamily: T.mono, fontWeight: 700 }}>{funds.length}</span>
              </div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 180 }}>
                {funds.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '28px 0', color: T.textLight, fontSize: 11 }}>No funds</div>
                ) : funds.map(m => (
                  <div key={m.id} onClick={() => handleManagerSelect(m)}
                    style={{ background: '#FAFBFC', border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.background = T.blueLight }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = '#FAFBFC' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2, letterSpacing: '-.01em' }}>{m.fund_name}</div>
                    <div style={{ fontSize: 11, color: T.textMid, marginBottom: 8 }}>{m.manager_name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: T.textLight, background: T.bg, padding: '2px 7px', borderRadius: 4, fontFamily: T.mono }}>{m.asset_class}</span>
                      {m.fund_size_mm && <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.mono }}>${m.fund_size_mm}M</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                      {PIPELINE_STAGES.filter(s => s.id !== stage.id).map(s => (
                        <button key={s.id} onClick={() => handleStatusChange(m.id, s.id)}
                          style={{ flex: 1, padding: '3px 0', fontSize: 9, background: '#fff', border: `1px solid ${s.color}44`, color: s.color, borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontFamily: T.sans }}>
                          {s.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Top bar ──────────────────────────────────────────────────────────────
  function TopBar() {
    const isDetail = view === 'detail'
    const isUpload = view === 'upload'
    const isAi = view === 'ai'

    return (
      <div style={{ height: 52, background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0 }}>
        {/* Breadcrumb */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMid }}>
          {(isDetail || isUpload || isAi) && (
            <>
              <span onClick={() => setView('list')} style={{ color: T.blue, cursor: 'pointer', fontWeight: 500 }}>Portfolio</span>
              <span style={{ color: T.textLight }}>/</span>
            </>
          )}
          <span style={{ fontWeight: 600, color: T.text }}>
            {isDetail ? selectedManager?.fund_name : isUpload ? 'Upload Document' : isAi ? 'AI Assistant' : viewMode === 'pipeline' ? 'Pipeline View' : selectedAssetClass}
          </span>
        </div>

        {/* View toggle (list only) */}
        {view === 'list' && (
          <div style={{ display: 'flex', background: T.bg, borderRadius: 7, padding: 2, gap: 2 }}>
            {[['asset', 'By Class'], ['pipeline', 'Pipeline']].map(([v, l]) => (
              <button key={v} onClick={() => setViewMode(v as ViewMode)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: viewMode === v ? T.surface : 'transparent', color: viewMode === v ? T.text : T.textLight, fontSize: 11, fontWeight: viewMode === v ? 600 : 400, cursor: 'pointer', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: T.sans }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <button onClick={() => setView('upload')} style={{ padding: '7px 16px', background: T.blue, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '-.01em', fontFamily: T.sans }}>
          + Upload
        </button>
      </div>
    )
  }

  // ── Pipeline summary strip ────────────────────────────────────────────────
  function PipelineSummary() {
    if (view !== 'list' || viewMode !== 'pipeline') return null
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {PIPELINE_STAGES.map(s => (
          <div key={s.id} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.text, fontFamily: T.mono, marginBottom: 2 }}>{countByStage(s.id)}</div>
            <div style={{ fontSize: 11, color: T.textMid, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: T.sans, color: T.text, background: T.bg, overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={sidebar}>
        {/* Logo */}
        <div style={sidebarTop}>
          {!sidebarCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-.02em', lineHeight: 1 }}>Storgate</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Alternatives</div>
              </div>
            </div>
          )}
          {sidebarCollapsed && <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>}
          {!sidebarCollapsed && (
            <button onClick={() => setSidebarCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 14, padding: 4 }}>‹</button>
          )}
        </div>

        {/* Expand when collapsed */}
        {sidebarCollapsed && (
          <button onClick={() => setSidebarCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: '8px 0', width: '100%' }}>›</button>
        )}

        {/* Main nav */}
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
          {navSection('Portfolio')}
          {navItem(view === 'ai', () => setView('ai'), '✦', 'AI Assistant')}

          {navSection('Asset Classes')}
          {ASSET_CLASSES.map(ac => navItem(
            view === 'list' && viewMode === 'asset' && selectedAssetClass === ac.id,
            () => { setSelectedAssetClass(ac.id); setViewMode('asset'); setView('list') },
            ac.icon,
            ac.id,
            countByClass(ac.id) || undefined
          ))}

          {navSection('Pipeline')}
          {PIPELINE_STAGES.map(s => navItem(
            view === 'list' && viewMode === 'pipeline',
            () => { setViewMode('pipeline'); setView('list') },
            '●',
            s.label,
            countByStage(s.id) || undefined
          )).slice(0, 1)}
          {!sidebarCollapsed && (
            <button onClick={() => { setViewMode('pipeline'); setView('list') }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', width: '100%', border: 'none', cursor: 'pointer', background: view === 'list' && viewMode === 'pipeline' ? 'rgba(59,130,246,0.15)' : 'transparent', borderLeft: view === 'list' && viewMode === 'pipeline' ? `2px solid ${T.blue}` : '2px solid transparent' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>⬡</span>
              <span style={{ fontSize: 12, color: view === 'list' && viewMode === 'pipeline' ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: view === 'list' && viewMode === 'pipeline' ? 600 : 400 }}>Kanban Board</span>
            </button>
          )}
        </div>

        {/* Bottom */}
        {!sidebarCollapsed && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.navyBorder}` }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: '.05em' }}>
              {managers.length} fund{managers.length !== 1 ? 's' : ''} tracked
            </div>
          </div>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />

        <div style={{ flex: 1, overflowY: 'auto', padding: view === 'ai' ? 0 : '20px 24px' }}>
          {loading && <div style={{ textAlign: 'center', color: T.textLight, padding: '80px 0', fontSize: 13 }}>Loading portfolio...</div>}

          {!loading && view === 'upload' && <DocumentUpload onUploadComplete={handleUploadComplete} />}
          {!loading && view === 'ai' && <div style={{ height: '100%' }}><AiAssistant /></div>}
          {!loading && view === 'list' && (
            <>
              <PipelineSummary />
              {viewMode === 'asset' && (
                <ManagerList
                  managers={filteredManagers}
                  assetClass={selectedAssetClass}
                  onSelectManager={handleManagerSelect}
                  onUploadClick={() => setView('upload')}
                />
              )}
              {viewMode === 'pipeline' && <KanbanBoard />}
            </>
          )}
          {!loading && view === 'detail' && selectedManager && (
            <ManagerDetail
              manager={selectedManager}
              onBack={() => { setSelectedManager(null); setView('list') }}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}

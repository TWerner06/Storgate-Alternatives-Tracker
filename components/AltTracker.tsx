// components/AltTracker.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadManagers, updateManagerStatus } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'
import AiAssistant from './alt/AiAssistant'

const ASSET_CLASSES = [
  'Private Equity', 'Private Credit', 'Hedge Funds', 'Managed Futures',
  'Private Real Estate', 'Energy', 'Crypto Assets', 'Opportunistic', 'Research',
]

const PIPELINE_STAGES = [
  { id: 'tracking', label: 'Tracking', color: '#6B7FA3', light: '#EEF1F8' },
  { id: 'near_investing', label: 'Near Investing', color: '#B8860B', light: '#FDF8E6' },
  { id: 'investing', label: 'Investing', color: '#2D6A2D', light: '#EDF7ED' },
  { id: 'pass', label: 'Pass', color: '#999', light: '#F5F4F1' },
]

type ViewMode = 'asset' | 'pipeline'

export default function AltTracker() {
  const [managers, setManagers] = useState<any[]>([])
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [view, setView] = useState<'list' | 'detail' | 'upload' | 'ai'>('list')
  const [viewMode, setViewMode] = useState<ViewMode>('asset')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadAllManagers() }, [])

  async function loadAllManagers() {
    setLoading(true)
    try {
      const { data, error } = await loadManagers()
      if (error) throw error
      setManagers(data || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleManagerSelect = (manager: any) => {
    setSelectedManager(manager)
    setView('detail')
  }

  const handleUploadComplete = () => {
    loadAllManagers()
    setView('list')
  }

  const handleStatusChange = async (managerId: string, newStatus: string) => {
    await updateManagerStatus(managerId, newStatus)
    setManagers(prev => prev.map(m => m.id === managerId ? { ...m, pipeline_status: newStatus } : m))
  }

  const filteredManagers = managers.filter(m => m.asset_class === selectedAssetClass)
  const countByClass = (ac: string) => managers.filter(m => m.asset_class === ac).length
  const countByStage = (stage: string) => managers.filter(m => m.pipeline_status === stage).length

  // ── Styles ──────────────────────────────────────────────────────────────
  const shell: CSSProperties = {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: 13,
    color: '#1C2B3A',
    background: '#F4F3F0',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  }

  const header: CSSProperties = {
    background: '#0F1E2E',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '0 24px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  }

  const headerTop: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  }

  const logoStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-.02em',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  }

  const logoAccent: CSSProperties = {
    width: 6,
    height: 6,
    background: '#4A9EE7',
    borderRadius: '50%',
    display: 'inline-block',
  }

  const headerActions: CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  }

  const headerBtn = (primary: boolean, active?: boolean): CSSProperties => ({
    padding: '6px 14px',
    background: primary ? '#4A9EE7' : active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
    color: '#fff',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '-.01em',
  })

  const headerBottom: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    height: 40,
  }

  const viewToggle: CSSProperties = {
    display: 'flex',
    gap: 2,
    marginRight: 20,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    padding: 2,
  }

  const toggleBtn = (active: boolean): CSSProperties => ({
    padding: '3px 10px',
    borderRadius: 4,
    border: 'none',
    background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
  })

  const tabsRow: CSSProperties = {
    display: 'flex',
    gap: 2,
    flex: 1,
    overflowX: 'auto',
  }

  const assetTab = (active: boolean): CSSProperties => ({
    padding: '0 14px',
    height: 40,
    border: 'none',
    borderBottom: active ? '2px solid #4A9EE7' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '-.01em',
  })

  const tabBadge = (active: boolean): CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    background: active ? '#4A9EE7' : 'rgba(255,255,255,0.12)',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    padding: '1px 5px',
    fontFamily: 'monospace',
  })

  const content: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: view === 'ai' ? 0 : '20px 24px',
    display: 'flex',
    flexDirection: 'column',
  }

  const breadcrumb: CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 40,
  }

  // ── Kanban board ──────────────────────────────────────────────────────────
  function KanbanBoard() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {PIPELINE_STAGES.map(stage => {
          const stageFunds = managers.filter(m => m.pipeline_status === stage.id)
          return (
            <div key={stage.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8E6E0', overflow: 'hidden' }}>
              {/* Column header */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #F0EEE8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1C2B3A', letterSpacing: '-.01em' }}>{stage.label}</span>
                </div>
                <span style={{ fontSize: 11, color: '#999', fontFamily: 'monospace', fontWeight: 600 }}>{stageFunds.length}</span>
              </div>
              {/* Cards */}
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
                {stageFunds.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#ccc', fontSize: 11 }}>No funds</div>
                ) : (
                  stageFunds.map(m => (
                    <KanbanCard key={m.id} manager={m} stage={stage} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function KanbanCard({ manager, stage }: { manager: any; stage: typeof PIPELINE_STAGES[0] }) {
    const [dragging, setDragging] = useState(false)
    return (
      <div
        onClick={() => handleManagerSelect(manager)}
        style={{
          background: dragging ? '#F8F7F4' : '#FAFAF8',
          border: '1px solid #E8E6E0',
          borderRadius: 7,
          padding: '10px 12px',
          cursor: 'pointer',
          transition: 'all .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#4A9EE7'; e.currentTarget.style.background = '#F0F6FD' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E6E0'; e.currentTarget.style.background = '#FAFAF8' }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1C2B3A', marginBottom: 3, letterSpacing: '-.01em' }}>{manager.fund_name}</div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{manager.manager_name}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#999', background: '#F0EEE8', padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace' }}>
            {manager.asset_class}
          </span>
          {manager.fund_size_mm && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1C2B3A', fontFamily: 'monospace' }}>${manager.fund_size_mm}M</span>
          )}
        </div>
        {/* Move buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
          {PIPELINE_STAGES.filter(s => s.id !== stage.id).map(s => (
            <button
              key={s.id}
              onClick={() => handleStatusChange(manager.id, s.id)}
              style={{ flex: 1, padding: '3px 0', fontSize: 9, background: '#fff', border: `1px solid ${s.color}33`, color: s.color, borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
            >
              → {s.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      {/* Header */}
      <div style={header}>
        <div style={headerTop}>
          <div style={logoStyle}>
            <span style={logoAccent} />
            Storgate · Alternatives
          </div>
          <div style={headerActions}>
            <button onClick={() => setView('ai')} style={headerBtn(false, view === 'ai')}>
              ✦ AI Assistant
            </button>
            <button onClick={() => setView('upload')} style={headerBtn(true)}>
              + Upload Doc
            </button>
          </div>
        </div>

        {/* Bottom bar — tabs or breadcrumb */}
        <div style={headerBottom}>
          {(view === 'upload' || view === 'ai') ? (
            <div style={breadcrumb}>
              <span onClick={() => setView('list')} style={{ color: '#4A9EE7', cursor: 'pointer' }}>← Portfolio</span>
              <span>/</span>
              <span>{view === 'upload' ? 'Upload Document' : 'AI Assistant'}</span>
            </div>
          ) : view === 'detail' ? (
            <div style={breadcrumb}>
              <span onClick={() => setView('list')} style={{ color: '#4A9EE7', cursor: 'pointer' }}>← Portfolio</span>
              <span>/</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{selectedManager?.fund_name}</span>
            </div>
          ) : (
            <>
              <div style={viewToggle}>
                <button onClick={() => setViewMode('asset')} style={toggleBtn(viewMode === 'asset')}>By Class</button>
                <button onClick={() => setViewMode('pipeline')} style={toggleBtn(viewMode === 'pipeline')}>Pipeline</button>
              </div>
              {viewMode === 'asset' && (
                <div style={tabsRow}>
                  {ASSET_CLASSES.map(ac => {
                    const count = countByClass(ac)
                    return (
                      <button key={ac} onClick={() => setSelectedAssetClass(ac)} style={assetTab(selectedAssetClass === ac)}>
                        {ac}
                        {count > 0 && <span style={tabBadge(selectedAssetClass === ac)}>{count}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              {viewMode === 'pipeline' && (
                <div style={{ ...tabsRow, alignItems: 'center', paddingLeft: 4 }}>
                  {PIPELINE_STAGES.map(s => {
                    const count = countByStage(s.id)
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                        {s.label}
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={content}>
        {loading && <div style={{ textAlign: 'center', color: '#aaa', padding: '80px 0', fontSize: 13 }}>Loading portfolio...</div>}
        {error && <div style={{ textAlign: 'center', color: '#A02020', padding: '40px 0' }}>Error: {error}</div>}

        {!loading && !error && view === 'upload' && (
          <DocumentUpload onUploadComplete={handleUploadComplete} />
        )}

        {!loading && !error && view === 'ai' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <AiAssistant />
          </div>
        )}

        {!loading && !error && view === 'list' && viewMode === 'asset' && (
          <ManagerList
            managers={filteredManagers}
            assetClass={selectedAssetClass}
            onSelectManager={handleManagerSelect}
            onUploadClick={() => setView('upload')}
          />
        )}

        {!loading && !error && view === 'list' && viewMode === 'pipeline' && (
          <KanbanBoard />
        )}

        {!loading && !error && view === 'detail' && selectedManager && (
          <ManagerDetail
            manager={selectedManager}
            onBack={() => { setSelectedManager(null); setView('list') }}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </div>
  )
}

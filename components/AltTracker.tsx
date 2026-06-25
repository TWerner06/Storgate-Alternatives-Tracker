// components/AltTracker.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadManagers } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'

const ASSET_CLASSES = [
  'Private Equity',
  'Private Credit',
  'Hedge Funds',
  'Managed Futures',
  'Private Real Estate',
  'Energy',
  'Crypto Assets',
  'Opportunistic',
  'Research',
]

export default function AltTracker() {
  const [managers, setManagers] = useState<any[]>([])
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [view, setView] = useState('list')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadAllManagers()
  }, [])

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
    // Reload managers and go back to list
    loadAllManagers()
    setView('list')
  }

  const filteredManagers = managers.filter(m => m.asset_class === selectedAssetClass)

  // Count per asset class for tab badges
  const countByClass = (ac: string) => managers.filter(m => m.asset_class === ac).length

  const shellStyle: CSSProperties = {
    fontFamily: 'system-ui,-apple-system,sans-serif',
    fontSize: 14,
    color: '#1a1a1a',
    background: '#f0eeea',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  }

  const headerStyle: CSSProperties = {
    background: '#fff',
    borderBottom: '1px solid #e0deda',
    padding: '16px 20px',
    flexShrink: 0,
  }

  const titleRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  }

  const titleStyle: CSSProperties = {
    fontSize: 22,
    fontWeight: 600,
    color: '#111',
    letterSpacing: '-.025em',
  }

  const uploadBtnStyle: CSSProperties = {
    padding: '8px 16px',
    background: '#0F1E2E',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  }

  const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  }

  const tabStyle = (active: boolean): CSSProperties => ({
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${active ? '#1A4A8A' : '#d0cec8'}`,
    background: active ? '#EEF3FB' : '#fff',
    color: active ? '#1A4A8A' : '#666',
    cursor: 'pointer',
    fontWeight: active ? 500 : 400,
    transition: 'all .1s',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  })

  const badgeStyle = (active: boolean): CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    background: active ? '#1A4A8A' : '#e0deda',
    color: active ? '#fff' : '#888',
    borderRadius: 10,
    padding: '1px 6px',
    fontFamily: 'monospace',
  })

  const contentStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  }

  return (
    <div style={shellStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleRowStyle}>
          <div style={titleStyle}>Storgate · Alternatives Tracker</div>
          <button
            onClick={() => setView('upload')}
            style={uploadBtnStyle}
          >
            + Upload Document
          </button>
        </div>

        {/* Asset class tabs — only show when not uploading */}
        {view !== 'upload' && (
          <div style={tabsStyle}>
            {ASSET_CLASSES.map(ac => {
              const count = countByClass(ac)
              return (
                <button
                  key={ac}
                  onClick={() => {
                    setSelectedAssetClass(ac)
                    setSelectedManager(null)
                    setView('list')
                  }}
                  style={tabStyle(selectedAssetClass === ac && view !== 'upload')}
                >
                  {ac}
                  {count > 0 && (
                    <span style={badgeStyle(selectedAssetClass === ac && view !== 'upload')}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Upload breadcrumb */}
        {view === 'upload' && (
          <div style={{ fontSize: 12, color: '#888' }}>
            <span
              onClick={() => setView('list')}
              style={{ color: '#1A4A8A', cursor: 'pointer' }}
            >
              ← Back to portfolio
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: '60px 20px' }}>
            Loading...
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', color: '#A02020', padding: '20px' }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && view === 'upload' && (
          <DocumentUpload onUploadComplete={handleUploadComplete} />
        )}

        {!loading && !error && view === 'list' && (
          <ManagerList
            managers={filteredManagers}
            assetClass={selectedAssetClass}
            onSelectManager={handleManagerSelect}
            onUploadClick={() => setView('upload')}
          />
        )}

        {!loading && !error && view === 'detail' && selectedManager && (
          <ManagerDetail
            manager={selectedManager}
            onBack={() => {
              setSelectedManager(null)
              setView('list')
            }}
          />
        )}
      </div>
    </div>
  )
}

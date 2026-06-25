// components/AltTracker.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { loadManagers, getStats } from '@/lib/supabase'
import DocumentUpload from './alt/DocumentUpload'
import ManagerList from './alt/ManagerList'
import ManagerDetail from './alt/ManagerDetail'

const ASSET_CLASSES = [
  'Private Equity',
  'Private Credit',
  'Real Assets',
  'Infrastructure',
  'Hedge Fund'
]

export default function AltTracker() {
  const [managers, setManagers] = useState([])
  const [selectedAssetClass, setSelectedAssetClass] = useState('Private Equity')
  const [selectedManager, setSelectedManager] = useState(null)
  const [view, setView] = useState('list') // 'list', 'detail', 'upload'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load managers on mount
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

  // Filter managers by selected asset class
  const filteredManagers = managers.filter(m => m.asset_class === selectedAssetClass)

  const handleManagerSelect = (manager: any) => {
    setSelectedManager(manager)
    setView('detail')
  }

  const handleUploadComplete = () => {
    loadAllManagers()
    setView('list')
  }

  // Styles
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

  const titleStyle: CSSProperties = {
    fontSize: 24,
    fontWeight: 600,
    color: '#111',
    marginBottom: 12,
    letterSpacing: '-.025em',
  }

  const navStyle: CSSProperties = {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #e0deda',
    marginBottom: 12,
  }

  const navButtonStyle = (active: boolean): CSSProperties => ({
    fontSize: 13,
    padding: '8px 16px',
    border: 'none',
    background: active ? '#fff' : 'transparent',
    cursor: 'pointer',
    color: active ? '#111' : '#888',
    borderBottom: active ? '2px solid #111' : '2px solid transparent',
    fontWeight: active ? 500 : 400,
    marginBottom: -1,
    transition: 'all .15s',
  })

  const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 12,
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
  })

  const contentStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  }

  const statsStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10,
    marginBottom: 16,
  }

  const statCardStyle: CSSProperties = {
    background: '#fff',
    borderRadius: 8,
    padding: '10px 14px',
    border: '1px solid #e0deda',
    textAlign: 'center',
  }

  const statValueStyle: CSSProperties = {
    fontSize: 20,
    fontWeight: 600,
    color: '#111',
    marginBottom: 4,
  }

  const statLabelStyle: CSSProperties = {
    fontSize: 10,
    color: '#aaa',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: '.05em',
  }

  return (
    <div style={shellStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>Alternative Investments Tracker</div>
        
        {/* Main nav */}
        <div style={navStyle}>
          {[['list', 'Portfolio'],['upload', 'Upload Document']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v as any)}
              style={navButtonStyle(view === v)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Asset class tabs (only show if viewing list or detail) */}
        {(view === 'list' || view === 'detail') && (
          <div style={tabsStyle}>
            {ASSET_CLASSES.map(ac => (
              <button
                key={ac}
                onClick={() => {
                  setSelectedAssetClass(ac)
                  setSelectedManager(null)
                  setView('list')
                }}
                style={tabStyle(selectedAssetClass === ac)}
              >
                {ac}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading && <div style={{ textAlign: 'center', color: '#aaa', padding: '40px 20px' }}>Loading...</div>}
        {error && <div style={{ textAlign: 'center', color: '#A02020', padding: '20px' }}>Error: {error}</div>}

        {!loading && !error && view === 'upload' && (
          <DocumentUpload 
            assetClass={selectedAssetClass}
            onUploadComplete={handleUploadComplete}
          />
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

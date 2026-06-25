// components/AltTracker.tsx
'use client'

import { useState, useEffect } from 'react'
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
      
      // Load stats
      // const statsData = await getStats()
      // setStats(statsData)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Filter managers by selected asset class
  const filteredManagers = managers.filter(m => m.asset_class === selectedAssetClass)

  const handleManagerSelect = (manager) => {
    setSelectedManager(manager)
    setView('detail')
  }

  const handleUploadComplete = () => {
    loadAllManagers()
    setView('list')
  }

  // Styles
  const SS = {
    shell: {
      fontFamily: 'system-ui,-apple-system,sans-serif',
      fontSize: 14,
      color: '#1a1a1a',
      background: '#f0eeea',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      background: '#fff',
      borderBottom: '1px solid #e0deda',
      padding: '16px 20px',
      flexShrink: 0,
    },
    title: {
      fontSize: 24,
      fontWeight: 600,
      color: '#111',
      marginBottom: 12,
      letterSpacing: '-.025em',
    },
    nav: {
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid #e0deda',
      marginBottom: 12,
    },
    navButton: (active) => ({
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
    }),
    tabs: {
      display: 'flex',
      gap: 4,
      flexWrap: 'wrap',
      marginBottom: 12,
    },
    tab: (active) => ({
      fontSize: 12,
      padding: '6px 12px',
      borderRadius: 6,
      border: `1px solid ${active ? '#1A4A8A' : '#d0cec8'}`,
      background: active ? '#EEF3FB' : '#fff',
      color: active ? '#1A4A8A' : '#666',
      cursor: 'pointer',
      fontWeight: active ? 500 : 400,
      transition: 'all .1s',
    }),
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 20px',
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      background: '#fff',
      borderRadius: 8,
      padding: '10px 14px',
      border: '1px solid #e0deda',
      textAlign: 'center',
    },
    statValue: {
      fontSize: 20,
      fontWeight: 600,
      color: '#111',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 10,
      color: '#aaa',
      fontFamily: 'monospace',
      textTransform: 'uppercase',
      letterSpacing: '.05em',
    },
  }

  return (
    <div style={SS.shell}>
      {/* Header */}
      <div style={SS.header}>
        <div style={SS.title}>Alternative Investments Tracker</div>
        
        {/* Main nav */}
        <div style={SS.nav}>
          {[['list', 'Portfolio'],['upload', 'Upload Document']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={SS.navButton(view === v)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Asset class tabs (only show if viewing list or detail) */}
        {(view === 'list' || view === 'detail') && (
          <div style={SS.tabs}>
            {ASSET_CLASSES.map(ac => (
              <button
                key={ac}
                onClick={() => {
                  setSelectedAssetClass(ac)
                  setSelectedManager(null)
                  setView('list')
                }}
                style={SS.tab(selectedAssetClass === ac)}
              >
                {ac}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={SS.content}>
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

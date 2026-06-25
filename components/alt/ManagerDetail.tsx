// components/alt/ManagerDetail.tsx
'use client'

import { useState, useEffect } from 'react'
import { loadDocs, loadFacts, loadNotes, loadCashflows } from '@/lib/supabase'

interface ManagerDetailProps {
  manager: any
  onBack: () => void
}

export default function ManagerDetail({ manager, onBack }: ManagerDetailProps) {
  const [documents, setDocuments] = useState([])
  const [facts, setFacts] = useState(null)
  const [notes, setNotes] = useState([])
  const [cashflows, setCashflows] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [manager.id])

  async function loadData() {
    setLoading(true)
    try {
      const [docsResult, factsResult, notesResult, cfResult] = await Promise.all([
        loadDocs(manager.id),
        loadFacts(manager.id),
        loadNotes(manager.id),
        loadCashflows(manager.id),
      ])

      if (docsResult.data) setDocuments(docsResult.data)
      if (factsResult.data?.length) setFacts(factsResult.data[0])
      if (notesResult.data) setNotes(notesResult.data)
      if (cfResult.data) setCashflows(cfResult.data)
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const SS = {
    container: {
      maxWidth: 1000,
      margin: '0 auto',
    },
    header: {
      marginBottom: 20,
    },
    backBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 13,
      color: '#1A4A8A',
      fontWeight: 500,
      marginBottom: 12,
      padding: 0,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: '#111',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 12,
      color: '#aaa',
      fontFamily: 'monospace',
    },
    nav: {
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid #e0deda',
      marginBottom: 16,
    },
    navBtn: (active) => ({
      fontSize: 12,
      padding: '8px 16px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: active ? '#111' : '#888',
      borderBottom: active ? '2px solid #111' : '2px solid transparent',
      fontWeight: active ? 500 : 400,
      marginBottom: -1,
    }),
    content: {
      minHeight: 300,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 10,
      marginBottom: 16,
    },
    card: {
      background: '#fff',
      border: '1px solid #e0deda',
      borderRadius: 6,
      padding: 12,
    },
    cardLabel: {
      fontSize: 10,
      color: '#aaa',
      textTransform: 'uppercase',
      marginBottom: 6,
      fontFamily: 'monospace',
    },
    cardValue: {
      fontSize: 16,
      fontWeight: 600,
      color: '#111',
      fontFamily: 'monospace',
    },
    section: {
      background: '#fff',
      border: '1px solid #e0deda',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 12,
      paddingBottom: 8,
      borderBottom: '1px solid #f0eeea',
    },
    docItem: {
      background: '#fafaf8',
      border: '1px solid #f0eeea',
      borderRadius: 5,
      padding: 10,
      marginBottom: 8,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    docName: {
      fontSize: 12,
      fontWeight: 500,
      color: '#111',
    },
    docType: {
      fontSize: 10,
      color: '#aaa',
      fontFamily: 'monospace',
      background: '#f5f4f1',
      padding: '2px 6px',
      borderRadius: 3,
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px 20px',
      color: '#aaa',
      fontSize: 12,
    },
  }

  if (loading) {
    return (
      <div style={SS.container}>
        <button onClick={onBack} style={SS.backBtn}>← Back</button>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={SS.container}>
      <div style={SS.header}>
        <button onClick={onBack} style={SS.backBtn}>← Back to list</button>
        <div style={SS.title}>{manager.fund_name}</div>
        <div style={SS.subtitle}>
          {manager.manager_name} • {manager.asset_class}
        </div>
      </div>

      {/* Overview Stats */}
      {facts && (
        <div style={SS.grid}>
          {facts.fund_size_mm && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>AUM</div>
              <div style={SS.cardValue}>${facts.fund_size_mm}M</div>
            </div>
          )}
          {facts.irr_net != null && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>IRR</div>
              <div style={{ ...SS.cardValue, color: facts.irr_net > 0 ? '#2D6A2D' : '#A02020' }}>
                {(facts.irr_net * 100).toFixed(1)}%
              </div>
            </div>
          )}
          {facts.tvpi && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>TVPI</div>
              <div style={SS.cardValue}>{facts.tvpi.toFixed(2)}x</div>
            </div>
          )}
          {facts.dpi && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>DPI</div>
              <div style={SS.cardValue}>{facts.dpi.toFixed(2)}x</div>
            </div>
          )}
          {facts.management_fee_pct && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>Mgmt Fee</div>
              <div style={SS.cardValue}>{facts.management_fee_pct.toFixed(2)}%</div>
            </div>
          )}
          {facts.lock_up_months && (
            <div style={SS.card}>
              <div style={SS.cardLabel}>Lock-up</div>
              <div style={SS.cardValue}>{facts.lock_up_months}mo</div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={SS.nav}>
        {['overview', 'documents', 'notes', 'cashflows'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={SS.navBtn(activeTab === tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={SS.content}>
        {/* Overview Tab */}
        {activeTab === 'overview' && facts && (
          <div style={SS.section}>
            <div style={SS.sectionTitle}>Fund Information</div>
            {facts.investment_strategy && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4, textTransform: 'uppercase' }}>Strategy</div>
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>{facts.investment_strategy}</div>
              </div>
            )}
            {facts.target_geographies?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4, textTransform: 'uppercase' }}>Geographies</div>
                <div style={{ fontSize: 13, color: '#333' }}>{facts.target_geographies.join(', ')}</div>
              </div>
            )}
            {facts.target_sectors?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4, textTransform: 'uppercase' }}>Sectors</div>
                <div style={{ fontSize: 13, color: '#333' }}>{facts.target_sectors.join(', ')}</div>
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div style={SS.section}>
            <div style={SS.sectionTitle}>Uploaded Documents</div>
            {documents.length === 0 ? (
              <div style={SS.emptyState}>No documents uploaded yet</div>
            ) : (
              documents.map(doc => (
                <div key={doc.id} style={SS.docItem}>
                  <div>
                    <div style={SS.docName}>{doc.doc_name}</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={SS.docType}>{doc.doc_type}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div style={SS.section}>
            <div style={SS.sectionTitle}>Qualitative Notes</div>
            {notes.length === 0 ? (
              <div style={SS.emptyState}>No notes added yet</div>
            ) : (
              notes.map(note => (
                <div key={note.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0eeea' }}>
                  <div style={{ fontSize: 10, color: '#1A4A8A', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase' }}>
                    {note.note_type}
                  </div>
                  <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>{note.content}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Cashflows Tab */}
        {activeTab === 'cashflows' && (
          <div style={SS.section}>
            <div style={SS.sectionTitle}>Capital Activity</div>
            {cashflows.length === 0 ? (
              <div style={SS.emptyState}>No cash flows recorded</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {cashflows.map(cf => (
                  <div key={cf.id} style={SS.card}>
                    <div style={SS.cardLabel}>{cf.cashflow_type}</div>
                    <div style={SS.cardValue}>${cf.amount_mm}M</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                      {new Date(cf.cashflow_date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

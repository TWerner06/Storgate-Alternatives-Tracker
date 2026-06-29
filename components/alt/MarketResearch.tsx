// components/alt/MarketResearch.tsx
'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@supabase/supabase-js'

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const DOC_TYPES = ['Benchmark Report', 'Market Analysis', 'Sector Research', 'Macro Outlook', 'LP Survey', 'Academic Paper', 'Other']
const ASSET_CLASSES = ['Private Equity', 'Private Credit', 'Hedge Funds', 'Managed Futures', 'Private Real Estate', 'Energy', 'Crypto Assets', 'Opportunistic', 'All']

export default function MarketResearch() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('Benchmark Report')
  const [source, setSource] = useState('')
  const [docDate, setDocDate] = useState('')
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['All'])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filterClass, setFilterClass] = useState('All')

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    setLoading(true)
    try {
      const { data } = await supabase.from('alt_market_research').select('*').order('created_at', { ascending: false })
      setDocs(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) setFile(files[0]) },
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'] },
    multiple: false,
  })

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', docType)
      formData.append('source', source)
      formData.append('docDate', docDate)
      formData.append('assetClasses', JSON.stringify(selectedClasses))

      const res = await fetch('/api/alt/market-research', { method: 'POST', body: formData })
      if (!res.ok) throw new Error((await res.json()).error)
      setSuccess('Document uploaded and processed successfully')
      setFile(null); setSource(''); setDocDate(''); setShowUpload(false)
      loadDocs()
    } catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  const filteredDocs = filterClass === 'All' ? docs : docs.filter(d => d.asset_class_relevance?.includes(filterClass) || d.asset_class_relevance?.includes('All'))

  const sec: CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 14 }
  const label: CSSProperties = { fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.05em' }
  const input: CSSProperties = { width: '100%', padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: T.sans, color: T.text, marginBottom: 12 }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: '-.02em', marginBottom: 4 }}>Market Research</div>
          <div style={{ fontSize: 12, color: T.textLight }}>Upload benchmark reports, sector research, and macro docs — the AI uses these as context for market comparisons</div>
        </div>
        <button onClick={() => setShowUpload(!showUpload)} style={{ padding: '8px 18px', background: T.blue, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + Upload Doc
        </button>
      </div>

      {success && <div style={{ background: T.greenLight, border: `1px solid ${T.green}44`, color: '#065F46', padding: '10px 14px', borderRadius: 7, fontSize: 12, marginBottom: 14, fontWeight: 500 }}>{success}</div>}
      {error && <div style={{ background: '#FEF2F2', border: `1px solid ${T.red}44`, color: '#991B1B', padding: '10px 14px', borderRadius: 7, fontSize: 12, marginBottom: 14 }}>{error}</div>}

      {/* Upload panel */}
      {showUpload && (
        <div style={{ ...sec, border: `1px solid ${T.blue}44`, background: T.blueLight }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Upload Market Research Document</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} style={input}>
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Source (e.g. Cambridge Associates)</label>
              <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source organization..." style={input} />
            </div>
            <div>
              <label style={label}>Document Date</label>
              <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Asset Class Relevance</label>
              <select value={selectedClasses[0]} onChange={e => setSelectedClasses([e.target.value])} style={input}>
                {ASSET_CLASSES.map(ac => <option key={ac}>{ac}</option>)}
              </select>
            </div>
          </div>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? T.blue : T.border}`, borderRadius: 8, padding: '24px', textAlign: 'center', cursor: 'pointer', background: isDragActive ? T.blueLight : T.surface, marginBottom: 12 }}>
            <input {...getInputProps()} />
            <div style={{ fontSize: 13, color: isDragActive ? T.blue : T.textMid }}>
              {isDragActive ? 'Drop here...' : '📄 Drag & drop PDF or text file'}
            </div>
            {file && <div style={{ fontSize: 11, color: T.blue, marginTop: 6, fontFamily: T.mono }}>📎 {file.name}</div>}
          </div>
          <button onClick={handleUpload} disabled={uploading || !file} style={{ padding: '9px 20px', background: uploading || !file ? '#ccc' : T.blue, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: uploading || !file ? 'not-allowed' : 'pointer' }}>
            {uploading ? '⏳ Processing...' : '↑ Upload & Extract'}
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', ...ASSET_CLASSES.filter(ac => ac !== 'All')].map(ac => (
          <button key={ac} onClick={() => setFilterClass(ac)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: filterClass === ac ? 600 : 400, border: `1px solid ${filterClass === ac ? T.blue : T.border}`, background: filterClass === ac ? T.blueLight : T.surface, color: filterClass === ac ? T.blue : T.textMid }}>
            {ac}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {DOC_TYPES.slice(0, 4).map(type => {
          const count = docs.filter(d => d.doc_type === type).length
          return (
            <div key={type} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? T.blue : T.textLight, fontFamily: T.mono }}>{count}</div>
              <div style={{ fontSize: 10, color: T.textLight, marginTop: 2 }}>{type}</div>
            </div>
          )
        })}
      </div>

      {/* Doc list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: T.textLight }}>Loading...</div>
      ) : filteredDocs.length === 0 ? (
        <div style={{ ...sec, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.2 }}>◎</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>No market research docs yet</div>
          <div style={{ fontSize: 12, color: T.textLight }}>Upload benchmark reports from Cambridge, Burgiss, NCREIF, HFRI, or any sector research</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredDocs.map(doc => (
            <div key={doc.id} style={{ ...sec, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>{doc.doc_name}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {doc.source && <span style={{ fontSize: 11, color: T.blue, fontWeight: 500 }}>{doc.source}</span>}
                  {doc.doc_date && <span style={{ fontSize: 11, color: T.textLight }}>{new Date(doc.doc_date).toLocaleDateString()}</span>}
                  {doc.asset_class_relevance?.map((ac: string) => (
                    <span key={ac} style={{ fontSize: 10, color: T.textMid, background: T.bg, padding: '2px 7px', borderRadius: 4 }}>{ac}</span>
                  ))}
                </div>
                {doc.summary && <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6 }}>{doc.summary}</div>}
                {doc.key_metrics && Object.keys(doc.key_metrics).length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(doc.key_metrics).slice(0, 4).map(([k, v]: any) => (
                      <div key={k} style={{ background: T.blueLight, padding: '4px 10px', borderRadius: 5, fontSize: 11 }}>
                        <span style={{ color: T.textLight }}>{k}: </span>
                        <span style={{ fontWeight: 700, color: T.blue, fontFamily: T.mono }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                <span style={{ fontSize: 10, color: T.textMid, background: T.bg, padding: '3px 8px', borderRadius: 5, fontFamily: T.mono }}>{doc.doc_type}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, color: doc.status === 'extracted' ? T.green : T.amber, background: doc.status === 'extracted' ? T.greenLight : T.amberLight }}>
                  {doc.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

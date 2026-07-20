// components/alt/DocumentUpload.tsx
'use client'

import { useState, CSSProperties, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface DocumentUploadProps {
  onUploadComplete?: () => void
}

type FileStatus = 'queued' | 'processing' | 'done' | 'error' | 'research'

interface QueuedFile {
  id: string
  file: File
  status: FileStatus
  fundName?: string
  assetClass?: string
  docType?: string
  isResearch?: boolean
  classificationReason?: string
  error?: string
}

const T = {
  blue: '#3B82F6', blueLight: '#EFF6FF',
  green: '#10B981', greenLight: '#ECFDF5',
  amber: '#F59E0B', amberLight: '#FFFBEB',
  red: '#EF4444', redLight: '#FEF2F2',
  purple: '#8B5CF6',
  slate: '#94A3B8',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', bg: '#F1F5F9', surface: '#fff',
  navy: '#0B1929',
  mono: "'JetBrains Mono','Fira Code',monospace",
  sans: "'Inter',system-ui,sans-serif",
}

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; bg: string; icon: string }> = {
  queued:     { label: 'Queued',     color: T.slate,  bg: '#F1F5F9',    icon: '○' },
  processing: { label: 'Processing', color: T.blue,   bg: T.blueLight,  icon: '⟳' },
  done:       { label: 'Complete',   color: T.green,  bg: T.greenLight, icon: '✓' },
  error:      { label: 'Error',      color: T.red,    bg: T.redLight,   icon: '✕' },
  research:   { label: 'Research',   color: T.purple, bg: '#F5F3FF',    icon: '◎' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export default function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [processing, setProcessing] = useState(false)
  const [allDone, setAllDone] = useState(false)

  const updateFile = useCallback((id: string, updates: Partial<QueuedFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: QueuedFile[] = acceptedFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'queued' as FileStatus,
    }))
    setQueue(prev => [...prev, ...newFiles])
    setAllDone(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: true,
  })

  async function processFile(qf: QueuedFile): Promise<void> {
    updateFile(qf.id, { status: 'processing' })

    try {
      const formData = new FormData()
      formData.append('file', qf.file)

      const response = await fetch('/api/alt/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let errMsg = 'Upload failed'
        try {
          const errData = await response.json()
          errMsg = errData.error || errMsg
        } catch {}
        updateFile(qf.id, { status: 'error', error: errMsg })
        return
      }

      const data = await response.json()

      if (data.isResearchDoc) {
        updateFile(qf.id, {
          status: 'research',
          isResearch: true,
          classificationReason: data.classificationReason,
        })
      } else {
        updateFile(qf.id, {
          status: 'done',
          fundName: data.extractedFacts?.fund_name || 'Unknown Fund',
          assetClass: data.extractedFacts?.asset_class,
          docType: data.extractedFacts?.doc_type,
        })
      }
    } catch (err: any) {
      updateFile(qf.id, { status: 'error', error: err.message || 'Network error' })
    }
  }

  async function startProcessing() {
    const toProcess = queue.filter(f => f.status === 'queued')
    if (!toProcess.length) return

    setProcessing(true)
    setAllDone(false)

    // Process sequentially — avoids hammering the API and makes progress clear
    for (const qf of toProcess) {
      await processFile(qf)
    }

    setProcessing(false)
    setAllDone(true)

    // Notify parent after short delay so user can see the results
    setTimeout(() => {
      onUploadComplete?.()
    }, 2500)
  }

  function clearCompleted() {
    setQueue(prev => prev.filter(f => f.status === 'queued' || f.status === 'processing'))
    setAllDone(false)
  }

  function removeFile(id: string) {
    setQueue(prev => prev.filter(f => f.id !== id))
  }

  const queued     = queue.filter(f => f.status === 'queued').length
  const done       = queue.filter(f => f.status === 'done').length
  const research   = queue.filter(f => f.status === 'research').length
  const errors     = queue.filter(f => f.status === 'error').length
  const inProgress = queue.filter(f => f.status === 'processing').length
  const total      = queue.length
  const completed  = done + research + errors

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: T.sans }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: T.navy, marginBottom: 4, letterSpacing: '-.01em' }}>
          Upload Fund Documents
        </h2>
        <p style={{ fontSize: 13, color: T.textLight, lineHeight: 1.6 }}>
          Drop multiple files at once — the AI will identify each fund, classify the document, and extract all relevant data automatically. Market reports and research documents are detected and saved separately without extracting financial data.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? T.blue : T.border}`,
          borderRadius: 12,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragActive ? T.blueLight : T.surface,
          transition: 'all .15s',
          marginBottom: 16,
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: 40, marginBottom: 10 }}>{isDragActive ? '📂' : '📄'}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: isDragActive ? T.blue : T.text, marginBottom: 6 }}>
          {isDragActive ? 'Drop files here' : 'Drag & drop fund documents'}
        </div>
        <div style={{ fontSize: 12, color: T.textLight, marginBottom: 8 }}>
          PDF, Word, or TXT · PPMs, DDQs, Quarterly Letters, Financials, Tear Sheets
        </div>
        <div style={{ fontSize: 11, color: T.blue, fontWeight: 600 }}>
          Multiple files supported — drop them all at once
        </div>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>

          {/* Queue header */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, background: '#FAFBFC' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.textMid, flex: 1 }}>
              {total} file{total !== 1 ? 's' : ''} queued
              {processing && ` · processing ${inProgress > 0 ? `(${completed}/${total})` : ''}`}
              {allDone && ` · ${done} extracted, ${research} research, ${errors} failed`}
            </span>
            {/* Progress bar */}
            {total > 0 && completed > 0 && (
              <div style={{ width: 120, height: 4, background: T.border, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${(completed / total) * 100}%`,
                  height: '100%',
                  background: errors > 0 && completed === total ? T.red : T.green,
                  borderRadius: 4,
                  transition: 'width .3s',
                }} />
              </div>
            )}
            {completed > 0 && !processing && (
              <button
                onClick={clearCompleted}
                style={{ fontSize: 11, color: T.textLight, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
              >
                Clear done
              </button>
            )}
          </div>

          {/* File list */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {queue.map((qf, i) => {
              const statusCfg = STATUS_CONFIG[qf.status]
              const isLast = i === queue.length - 1

              return (
                <div
                  key={qf.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '11px 16px',
                    borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
                    background: qf.status === 'processing' ? T.blueLight : 'transparent',
                    transition: 'background .2s',
                  }}
                >
                  {/* Status icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: statusCfg.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: statusCfg.color,
                    fontFamily: T.mono,
                    animation: qf.status === 'processing' ? 'spin 1s linear infinite' : 'none',
                  }}>
                    {statusCfg.icon}
                  </div>

                  {/* File info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {qf.file.name}
                      </span>
                      <span style={{ fontSize: 10, color: T.textLight, flexShrink: 0, fontFamily: T.mono }}>
                        {formatSize(qf.file.size)}
                      </span>
                    </div>

                    {/* Status detail */}
                    {qf.status === 'queued' && (
                      <div style={{ fontSize: 11, color: T.textLight }}>Waiting to process</div>
                    )}
                    {qf.status === 'processing' && (
                      <div style={{ fontSize: 11, color: T.blue, fontWeight: 500 }}>
                        Classifying → Extracting → Validating...
                      </div>
                    )}
                    {qf.status === 'done' && (
                      <div style={{ fontSize: 11, color: T.textMid }}>
                        <span style={{ fontWeight: 600, color: T.green }}>{qf.fundName}</span>
                        {qf.assetClass && <span style={{ color: T.textLight }}> · {qf.assetClass}</span>}
                        {qf.docType && <span style={{ color: T.textLight }}> · {qf.docType}</span>}
                      </div>
                    )}
                    {qf.status === 'research' && (
                      <div style={{ fontSize: 11, color: T.purple }}>
                        Saved as Research — {qf.classificationReason || 'identified as market/multi-fund document'}
                      </div>
                    )}
                    {qf.status === 'error' && (
                      <div style={{ fontSize: 11, color: T.red }}>
                        {qf.error || 'Upload failed'}
                      </div>
                    )}
                  </div>

                  {/* Status badge + remove button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      color: statusCfg.color, background: statusCfg.bg,
                      border: `1px solid ${statusCfg.color}33`,
                    }}>
                      {statusCfg.label}
                    </span>
                    {qf.status === 'queued' && (
                      <button
                        onClick={() => removeFile(qf.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textLight, fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {queue.length > 0 && (
        <div style={{ display: 'flex', gap: 10 }}>
          {queued > 0 && !processing && (
            <button
              onClick={startProcessing}
              style={{
                flex: 1, padding: '12px', background: T.navy, color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.sans, transition: 'all .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1e3a5f')}
              onMouseLeave={e => (e.currentTarget.style.background = T.navy)}
            >
              ✦ Process {queued} file{queued !== 1 ? 's' : ''}
            </button>
          )}

          {processing && (
            <button
              disabled
              style={{
                flex: 1, padding: '12px', background: T.bg, color: T.textLight,
                border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14,
                fontWeight: 600, cursor: 'not-allowed', fontFamily: T.sans,
              }}
            >
              ⏳ Processing {completed}/{total}...
            </button>
          )}

          {allDone && queued === 0 && (
            <button
              onClick={() => { setQueue([]); setAllDone(false) }}
              style={{
                padding: '12px 20px', background: T.surface, color: T.textMid,
                border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
              }}
            >
              Upload more
            </button>
          )}
        </div>
      )}

      {/* Summary banner when all done */}
      {allDone && (
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 8,
          background: errors > 0 ? T.amberLight : T.greenLight,
          border: `1px solid ${errors > 0 ? T.amber : T.green}44`,
          fontSize: 13, color: errors > 0 ? '#92400E' : '#065F46', fontWeight: 600,
        }}>
          {errors === 0
            ? `✓ All ${total} file${total !== 1 ? 's' : ''} processed — ${done} fund${done !== 1 ? 's' : ''} extracted${research > 0 ? `, ${research} saved as research` : ''}. Redirecting to portfolio...`
            : `⚠ ${done} extracted, ${research} research, ${errors} failed. Check errors above and retry if needed.`
          }
        </div>
      )}

      {/* Spinning animation for processing icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

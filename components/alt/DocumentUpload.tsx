// components/alt/DocumentUpload.tsx
'use client'

import { useState, CSSProperties } from 'react'
import { useDropzone } from 'react-dropzone'

interface DocumentUploadProps {
  onUploadComplete?: () => void
}

interface ExtractionResult {
  fund_name: string
  manager_name: string
  asset_class: string
  doc_type: string
  confidence: number
  key_facts: Record<string, any>
}

export default function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ExtractionResult | null>(null)

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setError('')
      setResult(null)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: false,
  })

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setError('')
    setResult(null)

    try {
      setStage('Reading document...')
      const formData = new FormData()
      formData.append('file', file)

      setStage('AI is identifying fund, asset class, and extracting data...')
      const response = await fetch('/api/alt/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Upload failed')
      }

      const data = await response.json()
      setResult(data.extractedFacts)
      setStage('Complete!')

      setTimeout(() => {
        onUploadComplete?.()
      }, 2000)

    } catch (err) {
      setError((err as Error).message)
      setStage('')
    } finally {
      setUploading(false)
    }
  }

  // Styles
  const containerStyle: CSSProperties = {
    maxWidth: 600,
    margin: '0 auto',
  }

  const dropzoneStyle: CSSProperties = {
    border: isDragActive ? '2px solid #1A4A8A' : '2px dashed #d0cec8',
    borderRadius: 12,
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: isDragActive ? '#EEF3FB' : '#fff',
    transition: 'all .15s',
    marginBottom: 16,
  }

  const iconStyle: CSSProperties = {
    fontSize: 48,
    marginBottom: 12,
  }

  const dropTitleStyle: CSSProperties = {
    fontSize: 16,
    fontWeight: 500,
    color: isDragActive ? '#1A4A8A' : '#111',
    marginBottom: 6,
  }

  const dropSubStyle: CSSProperties = {
    fontSize: 12,
    color: '#aaa',
  }

  const fileNameStyle: CSSProperties = {
    marginTop: 12,
    fontSize: 12,
    color: '#1A4A8A',
    fontFamily: 'monospace',
    background: '#EEF3FB',
    padding: '4px 10px',
    borderRadius: 4,
    display: 'inline-block',
  }

  const buttonStyle = (disabled: boolean): CSSProperties => ({
    width: '100%',
    padding: '12px',
    background: disabled ? '#ccc' : '#0F1E2E',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s',
    marginBottom: 16,
  })

  const stageStyle: CSSProperties = {
    textAlign: 'center',
    fontSize: 13,
    color: '#666',
    padding: '12px',
    background: '#fafaf8',
    borderRadius: 6,
    marginBottom: 12,
    fontStyle: 'italic',
  }

  const errorStyle: CSSProperties = {
    background: '#FDF0F0',
    border: '1px solid #F5A0A0',
    color: '#A02020',
    padding: 12,
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 12,
  }

  const resultStyle: CSSProperties = {
    background: '#EDF7ED',
    border: '1px solid #A8D8A8',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  }

  const resultTitleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#2D6A2D',
    marginBottom: 12,
  }

  const resultGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  }

  const resultItemStyle: CSSProperties = {
    background: '#fff',
    borderRadius: 5,
    padding: '8px 10px',
  }

  const resultLabelStyle: CSSProperties = {
    fontSize: 10,
    color: '#aaa',
    textTransform: 'uppercase',
    marginBottom: 3,
    fontFamily: 'monospace',
  }

  const resultValueStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: '#111',
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>Upload Fund Document</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Drop any fund document — the AI will automatically identify the fund, asset class, and extract all relevant data.
      </p>

      {error && <div style={errorStyle}>⚠️ {error}</div>}

      {/* Dropzone */}
      <div {...getRootProps()} style={dropzoneStyle}>
        <input {...getInputProps()} />
        <div style={iconStyle}>{isDragActive ? '📂' : '📄'}</div>
        <div style={dropTitleStyle}>
          {isDragActive ? 'Drop it here' : 'Drag & drop a fund document'}
        </div>
        <div style={dropSubStyle}>
          PDF, Word, or text — PPM, DDQ, Quarterly Letter, Audited Financials
        </div>
        {file && <div style={fileNameStyle}>📎 {file.name}</div>}
      </div>

      {/* Upload button */}
      {file && !uploading && !result && (
        <button onClick={handleUpload} style={buttonStyle(false)}>
          ✦ Upload & Extract
        </button>
      )}

      {/* Progress */}
      {uploading && (
        <>
          <button style={buttonStyle(true)} disabled>⏳ Processing...</button>
          {stage && <div style={stageStyle}>{stage}</div>}
        </>
      )}

      {/* Result */}
      {result && (
        <div style={resultStyle}>
          <div style={resultTitleStyle}>✓ Extraction Complete — Added to {result.asset_class || 'portfolio'}</div>
          <div style={resultGridStyle}>
            {result.fund_name && (
              <div style={resultItemStyle}>
                <div style={resultLabelStyle}>Fund Name</div>
                <div style={resultValueStyle}>{result.fund_name}</div>
              </div>
            )}
            {result.manager_name && (
              <div style={resultItemStyle}>
                <div style={resultLabelStyle}>Manager</div>
                <div style={resultValueStyle}>{result.manager_name}</div>
              </div>
            )}
            {result.asset_class && (
              <div style={resultItemStyle}>
                <div style={resultLabelStyle}>Asset Class</div>
                <div style={resultValueStyle}>{result.asset_class}</div>
              </div>
            )}
            {result.doc_type && (
              <div style={resultItemStyle}>
                <div style={resultLabelStyle}>Doc Type</div>
                <div style={resultValueStyle}>{result.doc_type}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

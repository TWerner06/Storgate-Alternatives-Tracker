// components/alt/DocumentUpload.tsx
'use client'

import { useState, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { saveManager } from '@/lib/supabase'

const DOC_TYPES = ['PPM', 'DDQ', 'Audited Financials', 'Quarterly Letter', 'Tear Sheet', 'Other']

interface DocumentUploadProps {
  assetClass: string
  onUploadComplete?: () => void
}

export default function DocumentUpload({ assetClass, onUploadComplete }: DocumentUploadProps) {
  const [fundName, setFundName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [docType, setDocType] = useState('PPM')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInputRef = useRef()

  const onDrop = (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setError('')
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
  })

  async function handleUpload() {
    if (!fundName.trim() || !managerName.trim() || !file) {
      setError('Please fill in all fields and select a file')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      // 1. Create manager record
      const managerId = `${fundName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const { data: managerData, error: managerError } = await saveManager({
        id: managerId,
        fund_name: fundName,
        manager_name: managerName,
        asset_class: assetClass,
        fund_slug: fundName.toLowerCase().replace(/\s+/g, '-'),
      })

      if (managerError) throw new Error(`Failed to create manager: ${managerError.message}`)

      // 2. Upload document
      const formData = new FormData()
      formData.append('file', file)
      formData.append('managerId', managerId)
      formData.append('docType', docType)
      formData.append('x-user-id', 'user_' + Date.now()) // Placeholder — should come from auth

      const response = await fetch('/api/alt/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const result = await response.json()
      
      setSuccess(`Document uploaded and extracted successfully! Fund: ${fundName}`)
      setFundName('')
      setManagerName('')
      setFile(null)
      setDocType('PPM')

      // Call parent's callback
      setTimeout(() => {
        onUploadComplete?.()
      }, 1500)

    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const SS = {
    container: {
      maxWidth: 600,
      margin: '0 auto',
    },
    section: {
      background: '#fff',
      border: '1px solid #e0deda',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    },
    label: {
      display: 'block',
      fontSize: 12,
      fontWeight: 500,
      color: '#666',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
    },
    input: {
      width: '100%',
      padding: '8px 11px',
      border: '1px solid #d0cec8',
      borderRadius: 5,
      fontSize: 13,
      outline: 'none',
      boxSizing: 'border-box',
      marginBottom: 10,
    },
    select: {
      width: '100%',
      padding: '8px 11px',
      border: '1px solid #d0cec8',
      borderRadius: 5,
      fontSize: 13,
      outline: 'none',
      boxSizing: 'border-box',
      marginBottom: 10,
    },
    dropzone: {
      border: isDragActive ? '2px solid #1A4A8A' : '2px dashed #d0cec8',
      borderRadius: 8,
      padding: 24,
      textAlign: 'center',
      cursor: 'pointer',
      background: isDragActive ? '#EEF3FB' : '#fafaf8',
      transition: 'all .15s',
      marginBottom: 10,
    },
    dropzoneText: {
      fontSize: 13,
      color: isDragActive ? '#1A4A8A' : '#666',
      marginBottom: 6,
    },
    fileName: {
      fontSize: 12,
      color: '#aaa',
      fontFamily: 'monospace',
      marginTop: 8,
    },
    button: (disabled) => ({
      width: '100%',
      padding: '10px',
      background: disabled ? '#ccc' : '#0F1E2E',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all .15s',
    }),
    error: {
      background: '#FDF0F0',
      border: '1px solid #F5A0A0',
      color: '#A02020',
      padding: 12,
      borderRadius: 6,
      fontSize: 12,
      marginBottom: 12,
    },
    success: {
      background: '#EDF7ED',
      border: '1px solid #A8D8A8',
      color: '#2D6A2D',
      padding: 12,
      borderRadius: 6,
      fontSize: 12,
      marginBottom: 12,
    },
  }

  return (
    <div style={SS.container}>
      <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 500 }}>Upload New Fund Document</h2>

      {error && <div style={SS.error}>{error}</div>}
      {success && <div style={SS.success}>{success}</div>}

      <div style={SS.section}>
        <label style={SS.label}>Fund Name *</label>
        <input
          type="text"
          value={fundName}
          onChange={e => setFundName(e.target.value)}
          placeholder="e.g., Apollo Growth Fund IV"
          style={SS.input}
        />

        <label style={SS.label}>Manager Name *</label>
        <input
          type="text"
          value={managerName}
          onChange={e => setManagerName(e.target.value)}
          placeholder="e.g., Apollo Global Management"
          style={SS.input}
        />

        <label style={SS.label}>Asset Class</label>
        <div style={{ fontSize: 12, color: '#666', padding: '8px 0', fontWeight: 500 }}>
          {assetClass}
        </div>

        <label style={SS.label}>Document Type *</label>
        <select
          value={docType}
          onChange={e => setDocType(e.target.value)}
          style={SS.select}
        >
          {DOC_TYPES.map(dt => (
            <option key={dt} value={dt}>{dt}</option>
          ))}
        </select>
      </div>

      <div style={SS.section}>
        <label style={SS.label}>Upload Document *</label>
        <div {...getRootProps()} style={SS.dropzone}>
          <input {...getInputProps()} />
          <div style={SS.dropzoneText}>
            {isDragActive ? '📄 Drop file here...' : '📁 Drag & drop a PDF, Word, or text file'}
          </div>
          {file && <div style={SS.fileName}>{file.name}</div>}
        </div>
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading}
        style={SS.button(uploading)}
      >
        {uploading ? '⏳ Uploading & extracting...' : '✦ Upload & Extract'}
      </button>
    </div>
  )
}

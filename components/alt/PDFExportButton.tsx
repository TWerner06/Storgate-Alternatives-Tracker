// components/alt/PDFExportButton.tsx
'use client'

import { useState } from 'react'
import { exportICMemoToPDF, ICMemoData } from '@/lib/pdf-export'

const T = {
  blue: '#3B82F6', blueMid: '#93C5FD',
  green: '#10B981',
  text: '#0F172A', textMid: '#475569', textLight: '#94A3B8',
  border: '#E2E8F0', surface: '#fff',
}

interface Props {
  fundName: string
  gp: string
  assetClass: string
  facts: any
  scores: Record<string, number | null>
  scoreConfidence?: Record<string, 'H' | 'M' | 'L'>
  stage1Score?: number
  stage2Score?: number
  investmentThesis?: string
  keyRisks?: string[]
  notes?: string
}

export default function PDFExportButton({
  fundName,
  gp,
  assetClass,
  facts,
  scores,
  scoreConfidence,
  stage1Score,
  stage2Score,
  investmentThesis = '',
  keyRisks = [],
  notes = '',
}: Props) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      setError(null)

      // Extract top risks from red flags if available
      const extractedRisks = keyRisks.length > 0 ? keyRisks : [
        'Liquidity constraints during market downturns',
        'Manager operational continuity',
        'Concentration risk in portfolio',
      ]

      const memoData: ICMemoData = {
        fundName,
        gp,
        assetClass,
        fundSize: facts?.fund_size_mm || null,
        targetIRR: facts?.target_irr || null,
        netIRR: facts?.irr_net || null,
        grossIRR: facts?.irr_gross || null,
        tvpi: facts?.tvpi || null,
        dpi: facts?.dpi || null,
        stage1Score: stage1Score || null,
        stage2Score: stage2Score || null,
        confidenceLevel: scoreConfidence?.['overall'] || 'M',
        investmentThesis,
        scoreDetails: Object.entries(scores).reduce((acc, [key, value]) => {
          acc[key] = {
            value,
            confidence: scoreConfidence?.[key] || 'M',
          }
          return acc
        }, {} as Record<string, any>),
        keyRisks: extractedRisks,
        notes,
        generatedDate: new Date(),
      }

      await exportICMemoToPDF(memoData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF')
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={isExporting}
        style={{
          padding: '8px 14px',
          background: isExporting ? T.textLight : T.blue,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: isExporting ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          opacity: isExporting ? 0.6 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
        onMouseEnter={(e) => {
          if (!isExporting) {
            (e.currentTarget as HTMLButtonElement).style.background = T.blueMid
          }
        }}
        onMouseLeave={(e) => {
          if (!isExporting) {
            (e.currentTarget as HTMLButtonElement).style.background = T.blue
          }
        }}
      >
        {isExporting ? '⏳ Exporting...' : '📄 Export IC Memo'}
      </button>
      {error && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: '#FEE2E2',
          color: '#7F1D1D',
          borderRadius: 6,
          fontSize: 11,
        }}>
          ✗ {error}
        </div>
      )}
    </div>
  )
}

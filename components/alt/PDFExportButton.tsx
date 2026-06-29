// components/alt/PDFExportButton.tsx
'use client'

import { useState } from 'react'

const T = {
  blue: '#3B82F6', blueMid: '#93C5FD',
  text: '#0F172A', textLight: '#94A3B8',
  border: '#E2E8F0',
}

interface Props {
  fundName: string
  gp: string
  assetClass: string
  facts: any
  scores: Record<string, number | null>
  stage1Score?: number | null
  stage2Score?: number | null
  notes?: string
}

export default function PDFExportButton({ fundName, gp, assetClass, facts, scores, stage1Score, stage2Score, notes = '' }: Props) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const score = stage2Score || stage1Score
      const scoreColor = !score ? '#ccc' : score >= 4 ? '#10B981' : score >= 3 ? '#3B82F6' : score >= 2 ? '#F59E0B' : '#EF4444'
      const fmt = {
        pct: (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`,
        mm: (v: number | null) => v == null ? 'N/A' : `$${v}M`,
        x: (v: number | null) => v == null ? 'N/A' : `${v.toFixed(2)}x`,
      }

      const html = `
        <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0F172A; padding: 48px; }
            .header { border-bottom: 3px solid #3B82F6; padding-bottom: 16px; margin-bottom: 24px; }
            .logo { font-size: 13px; font-weight: 700; color: #3B82F6; letter-spacing: .1em; margin-bottom: 8px; }
            .title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
            .meta { display: flex; gap: 24px; margin-top: 10px; flex-wrap: wrap; }
            .meta-item { display: flex; flex-direction: column; }
            .meta-label { font-size: 9px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 2px; }
            .meta-value { font-size: 12px; font-weight: 600; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 12px; }
            .score-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
            .score-circle { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: white; background: ${scoreColor}; flex-shrink: 0; }
            .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .metric { padding: 10px 12px; background: #F8FAFC; border-radius: 6px; border-left: 3px solid #3B82F6; }
            .metric-label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
            .metric-value { font-size: 15px; font-weight: 700; font-family: 'Courier New', monospace; }
            .notes-box { padding: 12px 14px; background: #F8FAFC; border-radius: 6px; font-size: 12px; color: #475569; line-height: 1.7; font-style: italic; }
            .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">STORGATE</div>
            <div class="title">Investment Committee Memo</div>
            <div class="meta">
              <div class="meta-item"><span class="meta-label">Fund</span><span class="meta-value">${fundName}</span></div>
              <div class="meta-item"><span class="meta-label">General Partner</span><span class="meta-value">${gp || '—'}</span></div>
              <div class="meta-item"><span class="meta-label">Asset Class</span><span class="meta-value">${assetClass}</span></div>
              <div class="meta-item"><span class="meta-label">Date</span><span class="meta-value">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Score & Recommendation</div>
            <div class="score-row">
              <div class="score-circle">${score?.toFixed(1) || '—'}</div>
              <div>
                <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${stage2Score ? 'Stage 2 Full Underwriting' : 'Stage 1 Initial Screen'}</div>
                <div style="font-size:12px;color:#475569;">${score && score >= 4 ? 'Strong candidate — recommend for investment committee' : score && score >= 3.5 ? 'Approved — suitable for inclusion, monitor quarterly' : score && score >= 3 ? 'Meets standard — proceed with additional diligence' : 'Below threshold — pass or significant concerns'}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Key Metrics</div>
            <div class="metrics">
              <div class="metric"><div class="metric-label">Fund Size</div><div class="metric-value">${fmt.mm(facts?.fund_size_mm)}</div></div>
              <div class="metric"><div class="metric-label">Net IRR</div><div class="metric-value">${fmt.pct(facts?.irr_net)}</div></div>
              <div class="metric"><div class="metric-label">TVPI</div><div class="metric-value">${fmt.x(facts?.tvpi)}</div></div>
              <div class="metric"><div class="metric-label">Gross IRR</div><div class="metric-value">${fmt.pct(facts?.irr_gross)}</div></div>
              <div class="metric"><div class="metric-label">Target IRR</div><div class="metric-value">${fmt.pct(facts?.target_irr)}</div></div>
              <div class="metric"><div class="metric-label">DPI</div><div class="metric-value">${fmt.x(facts?.dpi)}</div></div>
              <div class="metric"><div class="metric-label">Mgmt Fee</div><div class="metric-value">${fmt.pct(facts?.management_fee_pct)}</div></div>
              <div class="metric"><div class="metric-label">Carry</div><div class="metric-value">${fmt.pct(facts?.carry_pct)}</div></div>
              <div class="metric"><div class="metric-label">GP Commit</div><div class="metric-value">${fmt.pct(facts?.gp_commitment_pct)}</div></div>
            </div>
          </div>

          ${facts?.investment_strategy ? `
          <div class="section">
            <div class="section-title">Strategy</div>
            <div class="notes-box">${facts.investment_strategy}</div>
          </div>` : ''}

          ${notes ? `
          <div class="section">
            <div class="section-title">Underwriting Notes</div>
            <div class="notes-box">${notes}</div>
          </div>` : ''}

          <div class="footer">
            <span>Storgate Alternatives Tracker</span>
            <span>Confidential — Internal Use Only</span>
          </div>
        </body>
        </html>
      `

      // Open in new window and print to PDF
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => {
          win.print()
          win.close()
        }, 500)
      }
    } catch (e) {
      console.error('Export error:', e)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      style={{
        padding: '6px 14px',
        background: isExporting ? T.textLight : T.blue,
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        fontSize: 11,
        fontWeight: 600,
        cursor: isExporting ? 'not-allowed' : 'pointer',
        opacity: isExporting ? 0.6 : 1,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {isExporting ? '⏳ Exporting...' : '📄 Export IC Memo'}
    </button>
  )
}

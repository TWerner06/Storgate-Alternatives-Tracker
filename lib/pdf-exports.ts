// lib/pdf-export.ts
// PRIORITY 5: PDF export for IC memos using html2pdf
import html2pdf from 'html2pdf.js'

export interface ICMemoData {
  fundName: string
  gp: string
  assetClass: string
  fundSize: number | null
  targetIRR: number | null
  netIRR: number | null
  grossIRR: number | null
  tvpi: number | null
  dpi: number | null
  stage1Score: number | null
  stage2Score: number | null
  confidenceLevel: 'H' | 'M' | 'L'
  investmentThesis: string
  scoreDetails: Record<string, { value: number | null; confidence: string }>
  keyRisks: string[]
  notes: string
  generatedDate: Date
}

function generateICMemoHTML(data: ICMemoData): string {
  const formatCurrency = (val: number | null) => val ? `$${val.toFixed(1)}M` : 'N/A'
  const formatPercent = (val: number | null) => val ? `${(val * 100).toFixed(1)}%` : 'N/A'
  const formatMultiple = (val: number | null) => val ? `${val.toFixed(2)}x` : 'N/A'

  const scoreColor = (score: number | null) => {
    if (!score) return '#ccc'
    if (score >= 4) return '#10B981'
    if (score >= 3) return '#3B82F6'
    if (score >= 2) return '#F59E0B'
    return '#EF4444'
  }

  const confidenceToLabel = (conf: 'H' | 'M' | 'L') => {
    if (conf === 'H') return 'High Confidence'
    if (conf === 'M') return 'Medium Confidence'
    return 'Low Confidence'
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>IC Memo - ${data.fundName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #0F172A;
            line-height: 1.6;
            background: #f5f5f5;
          }
          
          .page {
            width: 8.5in;
            height: 11in;
            margin: 0 auto;
            background: white;
            padding: 0.75in;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            page-break-after: always;
          }
          
          .header {
            border-bottom: 3px solid #3B82F6;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          
          .logo {
            font-size: 24px;
            font-weight: 700;
            color: #3B82F6;
            margin-bottom: 8px;
          }
          
          .title {
            font-size: 22px;
            font-weight: 700;
            color: #0F172A;
            margin-bottom: 4px;
          }
          
          .meta-row {
            display: flex;
            gap: 20px;
            font-size: 11px;
            color: #475569;
            margin-top: 8px;
          }
          
          .meta-item {
            display: flex;
            flex-direction: column;
          }
          
          .meta-label {
            font-weight: 600;
            color: #94A3B8;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
          }
          
          .meta-value {
            font-size: 12px;
            font-weight: 600;
            color: #0F172A;
          }
          
          .section {
            margin-bottom: 18px;
          }
          
          .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #0F172A;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border-bottom: 2px solid #E2E8F0;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          
          .metrics-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
          }
          
          .metric-box {
            padding: 10px;
            background: #F1F5F9;
            border-radius: 6px;
            border-left: 3px solid #3B82F6;
          }
          
          .metric-label {
            font-size: 9px;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
            margin-bottom: 3px;
          }
          
          .metric-value {
            font-size: 14px;
            font-weight: 700;
            color: #0F172A;
            font-family: 'Courier New', monospace;
          }
          
          .score-box {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 16px;
            font-weight: 700;
            color: white;
            margin-right: 8px;
          }
          
          .score-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 4px;
            background: #EFF6FF;
            color: #1e40af;
          }
          
          .thesis {
            font-size: 11px;
            line-height: 1.6;
            color: #475569;
            padding: 10px;
            background: #FFFBEB;
            border-left: 3px solid #F59E0B;
            border-radius: 4px;
          }
          
          .risks-list {
            font-size: 11px;
            color: #475569;
            list-style: none;
            padding-left: 0;
          }
          
          .risks-list li {
            padding: 4px 0;
            padding-left: 16px;
            position: relative;
          }
          
          .risks-list li:before {
            content: "●";
            position: absolute;
            left: 0;
            color: #EF4444;
            font-weight: bold;
          }
          
          .notes {
            font-size: 11px;
            line-height: 1.6;
            color: #475569;
            font-style: italic;
            padding: 10px;
            background: #F1F5F9;
            border-radius: 4px;
          }
          
          .footer {
            font-size: 9px;
            color: #94A3B8;
            border-top: 1px solid #E2E8F0;
            padding-top: 10px;
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
          }
          
          @media print {
            body {
              background: white;
            }
            .page {
              box-shadow: none;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- Header -->
          <div class="header">
            <div class="logo">STORGATE</div>
            <div class="title">Investment Committee Memo</div>
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-label">Fund Name</span>
                <span class="meta-value">${data.fundName}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">General Partner</span>
                <span class="meta-value">${data.gp}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Asset Class</span>
                <span class="meta-value">${data.assetClass}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Generated</span>
                <span class="meta-value">${data.generatedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          <!-- Recommendation & Score -->
          <div class="section">
            <div class="section-title">Recommendation</div>
            <div style="margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div class="score-box" style="background-color: ${scoreColor(data.stage2Score || data.stage1Score)}">
                  ${(data.stage2Score || data.stage1Score || 0).toFixed(1)}
                </div>
                <span style="font-weight: 600; font-size: 12px;">
                  ${data.stage2Score ? 'Stage 2 Score' : 'Stage 1 Score'} — 
                  <span class="score-badge">${confidenceToLabel(data.confidenceLevel)}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Key Metrics -->
          <div class="section">
            <div class="section-title">Key Metrics</div>
            <div class="metrics-grid">
              <div class="metric-box">
                <div class="metric-label">Fund Size</div>
                <div class="metric-value">${formatCurrency(data.fundSize)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">Net IRR</div>
                <div class="metric-value">${formatPercent(data.netIRR)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">TVPI</div>
                <div class="metric-value">${formatMultiple(data.tvpi)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">Gross IRR</div>
                <div class="metric-value">${formatPercent(data.grossIRR)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">Target IRR</div>
                <div class="metric-value">${formatPercent(data.targetIRR)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">DPI</div>
                <div class="metric-value">${formatMultiple(data.dpi)}</div>
              </div>
            </div>
          </div>

          <!-- Investment Thesis -->
          ${data.investmentThesis ? `
            <div class="section">
              <div class="section-title">Investment Thesis</div>
              <div class="thesis">${data.investmentThesis}</div>
            </div>
          ` : ''}

          <!-- Key Risks -->
          ${data.keyRisks && data.keyRisks.length > 0 ? `
            <div class="section">
              <div class="section-title">Key Risks</div>
              <ul class="risks-list">
                ${data.keyRisks.map(risk => `<li>${risk}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <!-- Notes -->
          ${data.notes ? `
            <div class="section">
              <div class="section-title">Underwriting Notes</div>
              <div class="notes">${data.notes}</div>
            </div>
          ` : ''}

          <!-- Footer -->
          <div class="footer">
            <span>Storgate Alternatives Tracker</span>
            <span>Confidential — Internal Use Only</span>
          </div>
        </div>
      </body>
    </html>
  `
}

export async function exportICMemoToPDF(data: ICMemoData, filename?: string): Promise<void> {
  const html = generateICMemoHTML(data)
  const element = document.createElement('div')
  element.innerHTML = html

  const options = {
    margin: 0,
    filename: filename || `${data.fundName.replace(/\s+/g, '_')}_IC_Memo.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, logging: false },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  }

  return new Promise((resolve, reject) => {
    html2pdf()
      .set(options)
      .from(html)
      .save()
      .catch((error: any) => {
        console.error('PDF export error:', error)
        reject(error)
      })
      .then(() => resolve())
  })
}

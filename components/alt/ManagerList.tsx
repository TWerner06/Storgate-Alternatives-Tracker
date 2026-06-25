// components/alt/ManagerList.tsx
'use client'

import { CSSProperties } from 'react'

interface ManagerListProps {
  managers: any[]
  assetClass: string
  onSelectManager: (manager: any) => void
  onUploadClick: () => void
}

export default function ManagerList({
  managers,
  assetClass,
  onSelectManager,
  onUploadClick,
}: ManagerListProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  }

  const titleStyle: CSSProperties = {
    fontSize: 16,
    fontWeight: 500,
    color: '#111',
  }

  const uploadBtnStyle: CSSProperties = {
    padding: '8px 16px',
    background: '#0F1E2E',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  }

  const statsStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 10,
    marginBottom: 16,
  }

  const statCardStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #e0deda',
    borderRadius: 6,
    padding: '10px 12px',
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

  const emptyStateStyle: CSSProperties = {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#aaa',
  }

  const emptyIconStyle: CSSProperties = {
    fontSize: 48,
    marginBottom: 16,
  }

  const listStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
  }

  const cardStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #e0deda',
    borderRadius: 8,
    padding: 14,
    cursor: 'pointer',
    transition: 'all .15s',
  }

  const fundNameStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: '#111',
    marginBottom: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const managerNameStyle: CSSProperties = {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const metricsStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    borderTop: '1px solid #f0eeea',
    paddingTop: 8,
  }

  const metricStyle: CSSProperties = {
    fontSize: 11,
  }

  const metricLabelStyle: CSSProperties = {
    color: '#aaa',
    fontSize: 9,
    textTransform: 'uppercase',
    marginBottom: 2,
  }

  const metricValueStyle: CSSProperties = {
    color: '#111',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'monospace',
  }

  if (managers.length === 0) {
    return (
      <div style={emptyStateStyle}>
        <div style={emptyIconStyle}>📊</div>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No funds yet</h3>
        <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
          Upload your first {assetClass} fund document to get started
        </p>
        <button onClick={onUploadClick} style={uploadBtnStyle}>
          ✦ Upload Document
        </button>
      </div>
    )
  }

  // Calculate stats
  const avgIRR = managers
    .filter(m => m.irr_net)
    .reduce((sum, m) => sum + (m.irr_net || 0), 0) / Math.max(managers.filter(m => m.irr_net).length, 1)
  
  const totalAUM = managers.reduce((sum, m) => sum + (m.fund_size_mm || 0), 0)
  const avgFee = managers
    .filter(m => m.management_fee_pct)
    .reduce((sum, m) => sum + (m.management_fee_pct || 0), 0) / Math.max(managers.filter(m => m.management_fee_pct).length, 1)

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>{managers.length} Fund{managers.length !== 1 ? 's' : ''}</div>
        <button onClick={onUploadClick} style={uploadBtnStyle}>
          + Upload Document
        </button>
      </div>

      <div style={statsStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{managers.length}</div>
          <div style={statLabelStyle}>Funds</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>${totalAUM.toFixed(0)}M</div>
          <div style={statLabelStyle}>Total AUM</div>
        </div>
        {managers.some(m => m.irr_net) && (
          <div style={statCardStyle}>
            <div style={statValueStyle}>{(avgIRR * 100).toFixed(1)}%</div>
            <div style={statLabelStyle}>Avg IRR</div>
          </div>
        )}
        {managers.some(m => m.management_fee_pct) && (
          <div style={statCardStyle}>
            <div style={statValueStyle}>{avgFee.toFixed(2)}%</div>
            <div style={statLabelStyle}>Avg Fee</div>
          </div>
        )}
      </div>

      <div style={listStyle}>
        {managers.map(manager => (
          <div
            key={manager.id}
            onClick={() => onSelectManager(manager)}
            style={cardStyle}
            onMouseEnter={e => {
              const target = e.currentTarget as HTMLDivElement
              target.style.borderColor = '#1A4A8A'
              target.style.boxShadow = '0 2px 8px rgba(26, 74, 138, 0.1)'
            }}
            onMouseLeave={e => {
              const target = e.currentTarget as HTMLDivElement
              target.style.borderColor = '#e0deda'
              target.style.boxShadow = 'none'
            }}
          >
            <div style={fundNameStyle} title={manager.fund_name}>
              {manager.fund_name || 'Unnamed Fund'}
            </div>
            <div style={managerNameStyle} title={manager.manager_name}>
              {manager.manager_name || '(No manager)'}
            </div>

            <div style={metricsStyle}>
              {manager.fund_size_mm && (
                <div style={metricStyle}>
                  <div style={metricLabelStyle}>AUM</div>
                  <div style={metricValueStyle}>${manager.fund_size_mm}M</div>
                </div>
              )}
              {manager.irr_net != null && (
                <div style={metricStyle}>
                  <div style={metricLabelStyle}>IRR</div>
                  <div style={{
                    ...metricValueStyle,
                    color: manager.irr_net > 0 ? '#2D6A2D' : '#A02020'
                  }}>
                    {(manager.irr_net * 100).toFixed(1)}%
                  </div>
                </div>
              )}
              {manager.management_fee_pct && (
                <div style={metricStyle}>
                  <div style={metricLabelStyle}>Fee</div>
                  <div style={metricValueStyle}>{manager.management_fee_pct.toFixed(2)}%</div>
                </div>
              )}
              {manager.tvpi && (
                <div style={metricStyle}>
                  <div style={metricLabelStyle}>TVPI</div>
                  <div style={metricValueStyle}>{manager.tvpi.toFixed(2)}x</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

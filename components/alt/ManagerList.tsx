// components/alt/ManagerList.tsx
'use client'

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
  const SS = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 16,
      fontWeight: 500,
      color: '#111',
    },
    uploadBtn: {
      padding: '8px 16px',
      background: '#0F1E2E',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 500,
      cursor: 'pointer',
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      background: '#fff',
      border: '1px solid #e0deda',
      borderRadius: 6,
      padding: '10px 12px',
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
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#aaa',
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    list: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 12,
    },
    card: {
      background: '#fff',
      border: '1px solid #e0deda',
      borderRadius: 8,
      padding: 14,
      cursor: 'pointer',
      transition: 'all .15s',
      ':hover': {
        borderColor: '#1A4A8A',
        boxShadow: '0 2px 8px rgba(26, 74, 138, 0.1)',
      },
    },
    fundName: {
      fontSize: 14,
      fontWeight: 500,
      color: '#111',
      marginBottom: 6,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    managerName: {
      fontSize: 12,
      color: '#666',
      marginBottom: 8,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    metrics: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      borderTop: '1px solid #f0eeea',
      paddingTop: 8,
    },
    metric: {
      fontSize: 11,
    },
    metricLabel: {
      color: '#aaa',
      fontSize: 9,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    metricValue: {
      color: '#111',
      fontSize: 13,
      fontWeight: 500,
      fontFamily: 'monospace',
    },
  }

  if (managers.length === 0) {
    return (
      <div style={SS.emptyState}>
        <div style={SS.emptyIcon}>📊</div>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No funds yet</h3>
        <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
          Upload your first {assetClass} fund document to get started
        </p>
        <button onClick={onUploadClick} style={SS.uploadBtn}>
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
    <div style={SS.container}>
      <div style={SS.header}>
        <div style={SS.title}>{managers.length} Fund{managers.length !== 1 ? 's' : ''}</div>
        <button onClick={onUploadClick} style={SS.uploadBtn}>
          + Upload Document
        </button>
      </div>

      <div style={SS.stats}>
        <div style={SS.statCard}>
          <div style={SS.statValue}>{managers.length}</div>
          <div style={SS.statLabel}>Funds</div>
        </div>
        <div style={SS.statCard}>
          <div style={SS.statValue}>${totalAUM.toFixed(0)}M</div>
          <div style={SS.statLabel}>Total AUM</div>
        </div>
        {managers.some(m => m.irr_net) && (
          <div style={SS.statCard}>
            <div style={SS.statValue}>{(avgIRR * 100).toFixed(1)}%</div>
            <div style={SS.statLabel}>Avg IRR</div>
          </div>
        )}
        {managers.some(m => m.management_fee_pct) && (
          <div style={SS.statCard}>
            <div style={SS.statValue}>{avgFee.toFixed(2)}%</div>
            <div style={SS.statLabel}>Avg Fee</div>
          </div>
        )}
      </div>

      <div style={SS.list}>
        {managers.map(manager => (
          <div
            key={manager.id}
            onClick={() => onSelectManager(manager)}
            style={{
              ...SS.card,
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1A4A8A'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(26, 74, 138, 0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e0deda'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={SS.fundName} title={manager.fund_name}>
              {manager.fund_name || 'Unnamed Fund'}
            </div>
            <div style={SS.managerName} title={manager.manager_name}>
              {manager.manager_name || '(No manager)'}
            </div>

            <div style={SS.metrics}>
              {manager.fund_size_mm && (
                <div style={SS.metric}>
                  <div style={SS.metricLabel}>AUM</div>
                  <div style={SS.metricValue}>${manager.fund_size_mm}M</div>
                </div>
              )}
              {manager.irr_net != null && (
                <div style={SS.metric}>
                  <div style={SS.metricLabel}>IRR</div>
                  <div style={{
                    ...SS.metricValue,
                    color: manager.irr_net > 0 ? '#2D6A2D' : '#A02020'
                  }}>
                    {(manager.irr_net * 100).toFixed(1)}%
                  </div>
                </div>
              )}
              {manager.management_fee_pct && (
                <div style={SS.metric}>
                  <div style={SS.metricLabel}>Fee</div>
                  <div style={SS.metricValue}>{manager.management_fee_pct.toFixed(2)}%</div>
                </div>
              )}
              {manager.tvpi && (
                <div style={SS.metric}>
                  <div style={SS.metricLabel}>TVPI</div>
                  <div style={SS.metricValue}>{manager.tvpi.toFixed(2)}x</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

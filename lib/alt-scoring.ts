// lib/alt-scoring.ts
// Scoring framework based on Storgate Alternatives Manager Summary Scorecard
// 1-5 scale | Three buckets per strategy | Composite = average of all criteria

export type ScoreValue = 1 | 2 | 3 | 4 | 5 | null

export interface Criterion {
  id: string
  label: string
  what_to_look_for: string
  bucket: 'returns' | 'process' | 'people'
}

export interface Flag {
  id: string
  label: string
}

export interface AssetClassConfig {
  label: string
  criteria: Criterion[]
  flags: Flag[]
  bucketLabels: {
    returns: string
    process: string
    people: string
  }
}

// Recommendation thresholds (same across all asset classes)
export const THRESHOLDS = {
  CONVICTION_BUY: 4.0,
  APPROVED: 3.0,
  WATCH_LIST: 2.0,
  DECLINE: 0,
}

export function getRecommendation(score: number): {
  label: string
  color: string
  action: string
} {
  if (score >= THRESHOLDS.CONVICTION_BUY) return {
    label: 'Conviction Buy',
    color: '#2D6A2D',
    action: 'Proceed to Full DD & IC Submission'
  }
  if (score >= THRESHOLDS.APPROVED) return {
    label: 'Approved',
    color: '#1A4A8A',
    action: 'Suitable for inclusion; monitor quarterly'
  }
  if (score >= THRESHOLDS.WATCH_LIST) return {
    label: 'Watch List',
    color: '#B8860B',
    action: 'Material concerns; 12–18 month review window'
  }
  return {
    label: 'Decline',
    color: '#A02020',
    action: 'Does not meet Storgate standards; revisit in 12 months'
  }
}

export function calcComposite(scores: Record<string, ScoreValue>): number | null {
  const vals = Object.values(scores).filter(v => v !== null) as number[]
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function calcBucketScore(
  scores: Record<string, ScoreValue>,
  criteria: Criterion[],
  bucket: 'returns' | 'process' | 'people'
): number | null {
  const bucketCriteria = criteria.filter(c => c.bucket === bucket)
  const vals = bucketCriteria
    .map(c => scores[c.id])
    .filter(v => v !== null) as number[]
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ── SCORING SCALE ──────────────────────────────────────────────────────────
export const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  5: { label: 'Exceptional', color: '#2D6A2D' },
  4: { label: 'Above Average', color: '#4A8A4A' },
  3: { label: 'Meets Standard', color: '#1A4A8A' },
  2: { label: 'Below Average', color: '#B8860B' },
  1: { label: 'Deficient', color: '#A02020' },
}

// ── ASSET CLASS CONFIGS ────────────────────────────────────────────────────

export const ALT_SCORING_CONFIG: Record<string, AssetClassConfig> = {

  // ── PRIVATE EQUITY (Buyout) ──────────────────────────────────────────────
  'Private Equity': {
    label: 'Private Equity (Buyout)',
    bucketLabels: {
      returns: 'Returns & Value Creation',
      process: 'Process & Sourcing',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'irr_moic_peers',
        label: 'IRR & MOIC vs. Vintage-Year Peers',
        what_to_look_for: 'Net IRR and MOIC relative to Cambridge / Burgiss same-vintage cohort. Top quartile = 4+.',
        bucket: 'returns',
      },
      {
        id: 'pme_public_index',
        label: 'PME vs. Public Index',
        what_to_look_for: 'KS-PME vs. Russell 2000. >1.15x = meaningful outperformance of public market alternative.',
        bucket: 'returns',
      },
      {
        id: 'operational_value_creation',
        label: 'Operational Value Creation',
        what_to_look_for: 'Revenue growth and EBITDA margin improvement across realized portfolio; not leverage-driven.',
        bucket: 'returns',
      },
      {
        id: 'proprietary_sourcing',
        label: 'Proprietary Deal Sourcing',
        what_to_look_for: '% of investments off-market or lightly-competed; demonstrates network and brand advantage.',
        bucket: 'process',
      },
      {
        id: 'entry_valuation_discipline',
        label: 'Entry Valuation Discipline',
        what_to_look_for: 'Consistent entry EV/EBITDA vs. market; avoids over-paying at cycle peaks.',
        bucket: 'process',
      },
      {
        id: 'team_stability',
        label: 'Team Stability & Succession',
        what_to_look_for: 'Senior partner retention; named successors; no disruptive departures in last 3 years.',
        bucket: 'people',
      },
      {
        id: 'gp_commitment',
        label: 'GP Commitment & Carry Alignment',
        what_to_look_for: 'GP commit ≥ 1% in cash; whole-fund carry with clawback; management fee discipline.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'keyman', label: 'Key man departure risk' },
      { id: 'fund_size_drift', label: 'Fund size growing faster than deal flow' },
      { id: 'mandate_drift', label: 'Strategy / mandate drift' },
      { id: 'distress', label: '≥ 3 portfolio companies in distress' },
    ],
  },

  // ── PRIVATE CREDIT ───────────────────────────────────────────────────────
  'Private Credit': {
    label: 'Private Credit',
    bucketLabels: {
      returns: 'Returns & Asset Quality',
      process: 'Underwriting & Portfolio Construction',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'yield_vs_benchmark',
        label: 'Yield vs. Benchmark Spreads',
        what_to_look_for: 'Net yield vs. leveraged loan / HY index spread; consistent risk-adjusted premium for illiquidity.',
        bucket: 'returns',
      },
      {
        id: 'default_loss_rates',
        label: 'Historical Default & Loss Rates',
        what_to_look_for: 'Realized default rates and loss-given-default vs. market. <1% annual loss rate = top quartile.',
        bucket: 'returns',
      },
      {
        id: 'portfolio_concentration',
        label: 'Portfolio Concentration Risk',
        what_to_look_for: 'Single obligor < 5%; sector concentration < 25%; vintage diversification across deal flow.',
        bucket: 'returns',
      },
      {
        id: 'underwriting_rigor',
        label: 'Underwriting Rigor',
        what_to_look_for: 'Depth of credit analysis; proprietary models; stress-testing; covenant quality and enforcement.',
        bucket: 'process',
      },
      {
        id: 'workout_experience',
        label: 'Workout & Restructuring Experience',
        what_to_look_for: 'Track record navigating defaults; recovery rates vs. peers; dedicated workout team.',
        bucket: 'process',
      },
      {
        id: 'team_credit_expertise',
        label: 'Team Credit Expertise & Stability',
        what_to_look_for: 'Senior credit officer tenure; breadth of experience across credit cycles; no key departures.',
        bucket: 'people',
      },
      {
        id: 'terms_alignment',
        label: 'Terms & LP Alignment',
        what_to_look_for: 'Management fee on invested (not committed) capital; GP co-invest in deals; clawback provisions.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'covenant_erosion', label: 'Covenant quality eroding (cov-lite creep)' },
      { id: 'concentration_risk', label: 'Single obligor > 5% of portfolio' },
      { id: 'vintage_concentration', label: 'Over 40% deployed in single vintage year' },
      { id: 'leverage_creep', label: 'Fund-level leverage exceeding 1.5x' },
    ],
  },

  // ── HEDGE FUNDS ──────────────────────────────────────────────────────────
  'Hedge Funds': {
    label: 'Hedge Funds',
    bucketLabels: {
      returns: 'Returns & Risk-Adjusted Performance',
      process: 'Strategy & Risk Management',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'sharpe_ratio',
        label: 'Sharpe Ratio vs. Peer Cohort',
        what_to_look_for: 'Net Sharpe ratio vs. HFRI strategy index. >1.0 Sharpe across full cycle = top quartile.',
        bucket: 'returns',
      },
      {
        id: 'max_drawdown',
        label: 'Max Drawdown & Recovery',
        what_to_look_for: 'Peak-to-trough drawdown vs. peers; months to recover; behavior in 2008, 2020, 2022.',
        bucket: 'returns',
      },
      {
        id: 'correlation',
        label: 'Correlation to S&P 500',
        what_to_look_for: 'Rolling 3-year correlation to equity beta. <0.3 = meaningful diversification benefit.',
        bucket: 'returns',
      },
      {
        id: 'strategy_clarity',
        label: 'Strategy Clarity & Repeatability',
        what_to_look_for: 'Is the edge clearly defined and repeatable? Avoid black-box strategies without attribution.',
        bucket: 'process',
      },
      {
        id: 'risk_management_framework',
        label: 'Risk Management Framework',
        what_to_look_for: 'Position sizing rules; stop-loss discipline; VaR limits; independent risk oversight.',
        bucket: 'process',
      },
      {
        id: 'pm_experience',
        label: 'Portfolio Manager Experience & Track Record',
        what_to_look_for: 'Full-cycle track record (>7 years); performance attributable to named PM; succession clarity.',
        bucket: 'people',
      },
      {
        id: 'fee_liquidity_terms',
        label: 'Fee Structure & Liquidity Terms',
        what_to_look_for: 'Management + performance fee vs. peers; lock-up vs. strategy liquidity; gates and side pockets.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'strategy_drift', label: 'Strategy / style drift detected' },
      { id: 'aum_growth', label: 'AUM growing faster than opportunity set' },
      { id: 'pm_departure', label: 'Named PM departure or succession risk' },
      { id: 'liquidity_mismatch', label: 'Portfolio liquidity shorter than redemption terms' },
    ],
  },

  // ── MANAGED FUTURES ──────────────────────────────────────────────────────
  'Managed Futures': {
    label: 'Managed Futures / CTA',
    bucketLabels: {
      returns: 'Returns & Crisis Alpha',
      process: 'Model & Execution',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'sharpe_trend',
        label: 'Sharpe Ratio (Full Cycle)',
        what_to_look_for: 'Net Sharpe > 0.6 across full cycle including flat/choppy regimes. >1.0 = exceptional.',
        bucket: 'returns',
      },
      {
        id: 'crisis_alpha',
        label: 'Crisis Alpha & Equity Decorrelation',
        what_to_look_for: 'Positive returns during equity drawdowns (2008, 2020, 2022). Correlation to S&P < -0.1.',
        bucket: 'returns',
      },
      {
        id: 'drawdown_recovery',
        label: 'Max Drawdown & Recovery Time',
        what_to_look_for: 'Max drawdown vs. SG CTA Index; months to recovery. Avoid strategies > 20% peak-to-trough.',
        bucket: 'returns',
      },
      {
        id: 'model_robustness',
        label: 'Model Robustness & Backtest Quality',
        what_to_look_for: 'Live track record vs. backtest; parameter sensitivity; not overfit to single regime.',
        bucket: 'process',
      },
      {
        id: 'market_coverage',
        label: 'Market Coverage & Diversification',
        what_to_look_for: 'Number of markets traded (>50 = well diversified); sector and geographic spread.',
        bucket: 'process',
      },
      {
        id: 'research_team',
        label: 'Research Team & Model Evolution',
        what_to_look_for: 'Dedicated R&D team; evidence of model improvement without overfitting; peer-reviewed research.',
        bucket: 'people',
      },
      {
        id: 'fees_capacity',
        label: 'Fee Structure & Capacity Discipline',
        what_to_look_for: 'Management + incentive fees vs. SG CTA Index peers; stated capacity limits and adherence.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'backtest_overfit', label: 'Backtest significantly outperforms live track record' },
      { id: 'regime_sensitivity', label: 'Strategy performs in single market regime only' },
      { id: 'capacity_breach', label: 'AUM approaching or exceeding stated capacity' },
      { id: 'model_opacity', label: 'Black-box model with no attribution transparency' },
    ],
  },

  // ── PRIVATE REAL ESTATE ──────────────────────────────────────────────────
  'Private Real Estate': {
    label: 'Private Real Estate',
    bucketLabels: {
      returns: 'Returns & Income Delivery',
      process: 'Process & Market Selection',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'irr_equity_multiple',
        label: 'IRR & Equity Multiple vs. Vintage-Year Peers',
        what_to_look_for: 'Net returns vs. NCREIF / MSCI Real Estate same-vintage and strategy cohort.',
        bucket: 'returns',
      },
      {
        id: 'cash_yield_noi',
        label: 'Cash Yield & NOI vs. Underwriting',
        what_to_look_for: 'Actual income return vs. acquisition underwriting; measures asset management execution quality.',
        bucket: 'returns',
      },
      {
        id: 'cap_rate_leverage',
        label: 'Cap Rate & Leverage Discipline',
        what_to_look_for: 'Entry cap rate vs. market; LTV discipline; avoids compressed-cap-rate peak deployment.',
        bucket: 'returns',
      },
      {
        id: 'market_selection',
        label: 'Market & Submarket Selection',
        what_to_look_for: 'Evidence of superior market timing and submarket identification; off-market sourcing relationships.',
        bucket: 'process',
      },
      {
        id: 'asset_management',
        label: 'Asset Management & Operating Platform',
        what_to_look_for: 'In-house vs. third-party; occupancy track record; NOI delivery vs. acquisition pro forma.',
        bucket: 'process',
      },
      {
        id: 'team_depth',
        label: 'Investment & Asset Mgmt Team Depth',
        what_to_look_for: 'Acquisitions, asset management, and development team stability and relevant experience.',
        bucket: 'people',
      },
      {
        id: 'gp_commit_esg',
        label: 'GP Commitment & ESG Track Record',
        what_to_look_for: 'GP commit ≥ 1%; sustainability credentials (LEED, ENERGY STAR) meeting LP requirements.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'peak_deployment', label: 'Deploying at compressed cap rates / peak' },
      { id: 'development_concentration', label: 'Development concentration > 40% of fund' },
      { id: 'structural_demand_risk', label: 'Structural demand risk (office / retail)' },
      { id: 'sponsor_stress', label: 'Sponsor balance sheet stress' },
    ],
  },

  // ── ENERGY ───────────────────────────────────────────────────────────────
  'Energy': {
    label: 'Energy',
    bucketLabels: {
      returns: 'Returns & Commodity Risk',
      process: 'Process & ESG',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'irr_moic_energy',
        label: 'IRR & MOIC vs. Vintage-Year Peers',
        what_to_look_for: 'Net returns vs. Cambridge energy cohort. Stress-test: return profile at -25% commodity price.',
        bucket: 'returns',
      },
      {
        id: 'hedging_coverage',
        label: 'Hedging Coverage & Price Realization',
        what_to_look_for: '% of near-term production hedged; realized price vs. strip; downside protection track record.',
        bucket: 'returns',
      },
      {
        id: 'reserve_quality',
        label: 'Reserve Quality & F&D Cost',
        what_to_look_for: 'PV-10 coverage vs. debt; independent reserve engineer quality; finding & development cost trend.',
        bucket: 'returns',
      },
      {
        id: 'technical_expertise',
        label: 'Technical Expertise & Operational Control',
        what_to_look_for: 'In-house geology and engineering; operated vs. non-operated; cost and timing control.',
        bucket: 'process',
      },
      {
        id: 'esg_transition',
        label: 'ESG & Energy Transition Positioning',
        what_to_look_for: 'Methane reduction commitments; regulatory track record; visible adaptation to transition risk.',
        bucket: 'process',
      },
      {
        id: 'technical_team',
        label: 'Technical Team Stability',
        what_to_look_for: 'Retention of lead geologist, reservoir engineers, and land team; institutional knowledge risk.',
        bucket: 'people',
      },
      {
        id: 'gp_commit_regulatory',
        label: 'GP Commitment & Regulatory Compliance',
        what_to_look_for: 'GP commit ≥ 1–2%; no material spills, violations, or enforcement actions.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'commodity_assumptions', label: 'Commodity price assumptions above strip' },
      { id: 'regulatory_tail', label: 'Environmental / regulatory tail risk' },
      { id: 'technical_departure', label: 'Key technical expert departure' },
      { id: 'no_transition', label: 'No visible energy transition adaptation' },
    ],
  },

  // ── CRYPTO ASSETS ────────────────────────────────────────────────────────
  'Crypto Assets': {
    label: 'Crypto Assets',
    bucketLabels: {
      returns: 'Returns & Risk-Adjusted Performance',
      process: 'Strategy & Security',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'risk_adj_returns',
        label: 'Risk-Adjusted Returns vs. BTC/ETH Benchmark',
        what_to_look_for: 'Sharpe ratio vs. BTC and ETH buy-and-hold. Active management must justify fees vs. passive.',
        bucket: 'returns',
      },
      {
        id: 'drawdown_recovery_crypto',
        label: 'Drawdown & Recovery vs. Crypto Cycle',
        what_to_look_for: 'Peak-to-trough drawdown in bear markets (2018, 2022); recovery pace vs. broad crypto index.',
        bucket: 'returns',
      },
      {
        id: 'regulatory_clarity',
        label: 'Regulatory Clarity & Jurisdiction',
        what_to_look_for: 'Licensed in reputable jurisdiction; legal opinions on holdings; no enforcement actions.',
        bucket: 'process',
      },
      {
        id: 'custody_security',
        label: 'Custody & Security Maturity',
        what_to_look_for: 'Institutional-grade custody (Coinbase Prime, Anchorage, Fireblocks); SOC 2 audit; insurance.',
        bucket: 'process',
      },
      {
        id: 'strategy_repeatability',
        label: 'Strategy Clarity & Repeatability',
        what_to_look_for: 'Clear alpha source (arbitrage, staking, L1/L2 thesis); not dependent on single cycle narrative.',
        bucket: 'process',
      },
      {
        id: 'team_technical_depth',
        label: 'Team Technical Depth',
        what_to_look_for: 'Engineers and developers on team; on-chain analysis capability; crypto-native experience.',
        bucket: 'people',
      },
      {
        id: 'terms_liquidity_crypto',
        label: 'Terms, Liquidity & Fee Structure',
        what_to_look_for: 'Redemption terms vs. underlying liquidity; management + performance fee vs. peers; GP co-invest.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'regulatory_risk', label: 'Unresolved regulatory or enforcement risk' },
      { id: 'custody_concern', label: 'Self-custody or unregulated exchange exposure' },
      { id: 'single_narrative', label: 'Returns dependent on single crypto narrative' },
      { id: 'liquidity_mismatch_crypto', label: 'Illiquid holdings vs. liquid redemption terms' },
    ],
  },

  // ── OPPORTUNISTIC ────────────────────────────────────────────────────────
  'Opportunistic': {
    label: 'Opportunistic',
    bucketLabels: {
      returns: 'Returns & Thesis Validation',
      process: 'Process & Repeatability',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'return_vs_risk',
        label: 'Return vs. Risk Profile',
        what_to_look_for: 'IRR or Sharpe vs. comparable opportunity benchmark; asymmetric payoff vs. drawdown risk.',
        bucket: 'returns',
      },
      {
        id: 'thesis_conviction',
        label: 'Thesis Conviction & Market Timing',
        what_to_look_for: 'Is the opportunity time-bound and clearly mispriced? Evidence of similar successful past calls.',
        bucket: 'returns',
      },
      {
        id: 'downside_protection',
        label: 'Downside Protection',
        what_to_look_for: 'Structural protections (senior secured, collateral, covenants); base case vs. stress case.',
        bucket: 'returns',
      },
      {
        id: 'strategy_repeatability_opp',
        label: 'Strategy Repeatability',
        what_to_look_for: 'Is this a one-off bet or part of a repeatable playbook? Prefer teams with 2+ prior cycles.',
        bucket: 'process',
      },
      {
        id: 'pivot_willingness',
        label: 'Willingness to Pivot if Thesis Breaks',
        what_to_look_for: 'Evidence of disciplined exit when thesis invalidated; no anchoring to sunk cost.',
        bucket: 'process',
      },
      {
        id: 'team_expertise_opp',
        label: 'Team Expertise in Specific Opportunity',
        what_to_look_for: 'Deep domain expertise in the specific asset type; not generalist team chasing yield.',
        bucket: 'people',
      },
      {
        id: 'alignment_opp',
        label: 'GP Alignment & Fee Structure',
        what_to_look_for: 'GP co-invest meaningful relative to fund size; hurdle rate; no fee on undeployed capital.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'thesis_unclear', label: 'Investment thesis unclear or not time-bound' },
      { id: 'no_downside', label: 'Limited downside protection or collateral' },
      { id: 'generalist_team', label: 'Generalist team without specific domain expertise' },
      { id: 'sunk_cost', label: 'Evidence of anchoring or sunk cost behavior' },
    ],
  },

  // ── RESEARCH (Emerging Managers) ─────────────────────────────────────────
  'Research': {
    label: 'Research / Emerging Managers',
    bucketLabels: {
      returns: 'Early Track Record & Potential',
      process: 'Investment Process & Differentiation',
      people: 'People & Alignment',
    },
    criteria: [
      {
        id: 'early_track_record',
        label: 'Early Track Record (≥ 3 years)',
        what_to_look_for: 'At least 3 years of audited performance; attribution clearly to named PM; benchmark context.',
        bucket: 'returns',
      },
      {
        id: 'return_potential',
        label: 'Return Potential vs. Capacity',
        what_to_look_for: 'Edge most powerful at small AUM; demonstrated ability to generate alpha before assets scaled.',
        bucket: 'returns',
      },
      {
        id: 'lp_retention',
        label: 'LP Retention & Reference Quality',
        what_to_look_for: 'Existing LPs re-upped; quality of anchor LP references; no significant redemptions.',
        bucket: 'returns',
      },
      {
        id: 'investment_philosophy',
        label: 'Investment Philosophy Clarity',
        what_to_look_for: 'Clearly articulated edge; not style-drifting to raise capital; consistent with track record.',
        bucket: 'process',
      },
      {
        id: 'differentiated_process',
        label: 'Differentiated Research Process',
        what_to_look_for: 'Proprietary data, network, or analytical approach not easily replicated by larger peers.',
        bucket: 'process',
      },
      {
        id: 'team_pedigree',
        label: 'Team Pedigree & Relevant Experience',
        what_to_look_for: 'Prior experience at top-tier firms; domain expertise in target strategy; no unexplained gaps.',
        bucket: 'people',
      },
      {
        id: 'founder_alignment',
        label: 'Founder Alignment & Scale Discipline',
        what_to_look_for: 'Founder investing meaningful personal capital; stated AUM ceiling; not chasing brand over returns.',
        bucket: 'people',
      },
    ],
    flags: [
      { id: 'track_record_short', label: 'Track record < 3 years or unaudited' },
      { id: 'style_drift_raise', label: 'Style drifting to raise capital' },
      { id: 'key_man_emerging', label: 'Single key man with no succession' },
      { id: 'aum_scaling_too_fast', label: 'AUM scaling faster than strategy capacity' },
    ],
  },
}

// ── SCORE SCALE DESCRIPTIONS ───────────────────────────────────────────────
export const SCALE_GUIDE = [
  { score: 5, label: 'Exceptional', description: 'Top decile vs. vintage-year peers; clear differentiated edge; best practice' },
  { score: 4, label: 'Above Average', description: 'Top quartile; strong process; minor concerns only; well-aligned terms' },
  { score: 3, label: 'Meets Standard', description: 'Median peer; adequate process; no material red flags; terms at market' },
  { score: 2, label: 'Below Average', description: 'Below-median peers; process or org concerns; terms below market standard' },
  { score: 1, label: 'Deficient', description: 'Bottom quartile or worse; material concern; automatic watch-list trigger' },
]

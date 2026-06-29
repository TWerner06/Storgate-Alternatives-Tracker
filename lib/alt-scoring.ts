// lib/alt-scoring.ts
// Two-stage scoring framework
// Stage 1: Simple 7-criteria initial screen (existing)
// Stage 2: Detailed strategy-specific underwriting (from Storgate template)

export type ScoreValue = number | null
export type ConfidenceLevel = 'H' | 'M' | 'L' | null

export interface Criterion {
  id: string
  label: string
  what_to_look_for: string
  scoring_guidance?: string
  bucket: 'returns' | 'process' | 'people' | 'risk'
  sub_weight?: number
}

export interface Flag {
  id: string
  label: string
  description: string
  severity: 'H' | 'M' | 'L'
}

export interface AssetClassConfig {
  label: string
  criteria: Criterion[]
  flags: Flag[]
  bucketLabels: {
    returns: string
    process: string
    people: string
    risk?: string
  }
}

// ── STAGE 2 PILLAR WEIGHTS ─────────────────────────────────────────────────
export const STAGE2_WEIGHTS: Record<string, Record<string, number>> = {
  'Buyout': { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
  'Growth Equity': { quant: 0.50, risk: 0.15, process: 0.25, org: 0.10 },
  'Venture Capital': { quant: 0.35, risk: 0.10, process: 0.35, org: 0.20 },
  'Private Real Estate': { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
  'Energy': { quant: 0.45, risk: 0.20, process: 0.25, org: 0.10 },
  'Private Credit': { quant: 0.55, risk: 0.20, process: 0.15, org: 0.10 },
  'Hedge Funds': { quant: 0.50, risk: 0.20, process: 0.20, org: 0.10 },
  'Managed Futures': { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
  'Crypto Assets': { quant: 0.35, risk: 0.25, process: 0.25, org: 0.15 },
  'Opportunistic': { quant: 0.45, risk: 0.20, process: 0.25, org: 0.10 },
}

// Map app asset classes to Stage 2 scorecard strategies
export const ASSET_CLASS_TO_STRATEGY: Record<string, string> = {
  'Private Equity': 'Buyout',
  'Private Credit': 'Private Credit',
  'Hedge Funds': 'Hedge Funds',
  'Managed Futures': 'Managed Futures',
  'Private Real Estate': 'Private Real Estate',
  'Energy': 'Energy',
  'Crypto Assets': 'Crypto Assets',
  'Opportunistic': 'Opportunistic',
}

// ── SCORING SCALE ──────────────────────────────────────────────────────────
export const THRESHOLDS = {
  CONVICTION_BUY: 4.0,
  APPROVED: 3.0,
  WATCH_LIST: 2.0,
  DECLINE: 0,
}

export const STAGE1_PASS_THRESHOLD = 3.5 // triggers Stage 2 banner

export function getRecommendation(score: number): { label: string; color: string; action: string } {
  if (score >= 4.0) return { label: 'Conviction Buy', color: '#059669', action: 'Proceed to Full DD & IC Submission' }
  if (score >= 3.0) return { label: 'Approved', color: '#3B82F6', action: 'Suitable for inclusion — monitor quarterly' }
  if (score >= 2.0) return { label: 'Watch List', color: '#F59E0B', action: 'Material concerns — 12–18 month review window' }
  return { label: 'Decline', color: '#EF4444', action: 'Does not meet Storgate standards — revisit in 12 months' }
}

export function calcComposite(scores: Record<string, ScoreValue>): number | null {
  const vals = Object.values(scores).filter(v => v !== null) as number[]
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function calcWeightedComposite(
  sectionScores: Record<string, number | null>,
  weights: Record<string, number>
): number | null {
  let totalWeight = 0
  let weightedSum = 0
  for (const [section, score] of Object.entries(sectionScores)) {
    if (score != null && weights[section] != null) {
      weightedSum += score * weights[section]
      totalWeight += weights[section]
    }
  }
  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

export const SCALE_GUIDE = [
  { score: 5, label: 'Exceptional', description: 'Top decile vs. vintage-year peers; clear differentiated edge' },
  { score: 4, label: 'Above Average', description: 'Top quartile; strong process; minor concerns only' },
  { score: 3, label: 'Meets Standard', description: 'Median peer; adequate process; no material red flags' },
  { score: 2, label: 'Below Average', description: 'Below-median peers; process or org concerns' },
  { score: 1, label: 'Deficient', description: 'Bottom quartile or worse; material concern; auto watch-list' },
]

// ── STAGE 1 SCORING CONFIG (Simple Initial Screen) ─────────────────────────
export const STAGE1_CONFIG: Record<string, AssetClassConfig> = {

  'Private Equity': {
    label: 'Private Equity — Initial Screen',
    bucketLabels: { returns: 'Returns & Value Creation', process: 'Process & Sourcing', people: 'People & Alignment' },
    criteria: [
      { id: 's1_irr_moic', label: 'IRR & MOIC vs. Vintage-Year Peers', what_to_look_for: 'Net IRR and MOIC vs. Cambridge/Burgiss same-vintage cohort. Top quartile = 4+.', bucket: 'returns' },
      { id: 's1_pme', label: 'PME vs. Public Index', what_to_look_for: 'KS-PME vs. Russell 2000. >1.15x = meaningful outperformance.', bucket: 'returns' },
      { id: 's1_ops', label: 'Operational Value Creation', what_to_look_for: 'Revenue growth and EBITDA margin improvement across realized portfolio.', bucket: 'returns' },
      { id: 's1_sourcing', label: 'Proprietary Deal Sourcing', what_to_look_for: '% of investments off-market or lightly-competed.', bucket: 'process' },
      { id: 's1_entry_val', label: 'Entry Valuation Discipline', what_to_look_for: 'Consistent entry EV/EBITDA vs. market; avoids overpaying at cycle peaks.', bucket: 'process' },
      { id: 's1_team', label: 'Team Stability & Succession', what_to_look_for: 'Senior partner retention; named successors; no disruptive departures in last 3 years.', bucket: 'people' },
      { id: 's1_gp_commit', label: 'GP Commitment & Carry Alignment', what_to_look_for: 'GP commit ≥1% in cash; whole-fund carry with clawback; management fee discipline.', bucket: 'people' },
    ],
    flags: [
      { id: 'keyman', label: 'Key man departure risk', description: 'Single partner drives >50% of sourcing or deal decisions; no named successor.', severity: 'H' },
      { id: 'fund_size_drift', label: 'Fund size growing faster than deal flow', description: 'AUM scaling materially ahead of team growth and market opportunity.', severity: 'M' },
      { id: 'mandate_drift', label: 'Strategy / mandate drift', description: 'Fund investing outside stated geography, sector, or company size without LP consent.', severity: 'H' },
      { id: 'distress', label: '≥3 portfolio companies in distress', description: 'Three or more portfolio companies in amendment, covenant waiver, or active distress.', severity: 'H' },
    ],
  },

  'Private Credit': {
    label: 'Private Credit — Initial Screen',
    bucketLabels: { returns: 'Returns & Asset Quality', process: 'Underwriting & Portfolio Construction', people: 'People & Alignment' },
    criteria: [
      { id: 's1_yield', label: 'Yield vs. Benchmark Spreads', what_to_look_for: 'Net yield vs. leveraged loan/HY index spread; consistent risk-adjusted premium for illiquidity.', bucket: 'returns' },
      { id: 's1_defaults', label: 'Historical Default & Loss Rates', what_to_look_for: 'Realized default rates and loss-given-default vs. market. <1% annual loss rate = top quartile.', bucket: 'returns' },
      { id: 's1_concentration', label: 'Portfolio Concentration Risk', what_to_look_for: 'Single obligor <5%; sector concentration <25%; vintage diversification.', bucket: 'returns' },
      { id: 's1_underwriting', label: 'Underwriting Rigor', what_to_look_for: 'Depth of credit analysis; proprietary models; stress-testing; covenant quality and enforcement.', bucket: 'process' },
      { id: 's1_workout', label: 'Workout & Restructuring Experience', what_to_look_for: 'Track record navigating defaults; recovery rates vs. peers; dedicated workout team.', bucket: 'process' },
      { id: 's1_credit_team', label: 'Team Credit Expertise & Stability', what_to_look_for: 'Senior credit officer tenure; breadth of experience across credit cycles.', bucket: 'people' },
      { id: 's1_terms_align', label: 'Terms & LP Alignment', what_to_look_for: 'Management fee on invested (not committed) capital; GP co-invest in deals; clawback provisions.', bucket: 'people' },
    ],
    flags: [
      { id: 'covenant_erosion', label: 'Covenant quality eroding (cov-lite creep)', description: 'Increasingly loose covenants reduce downside protection for LPs.', severity: 'H' },
      { id: 'single_obligor', label: 'Single obligor >5% of portfolio', description: 'Concentration in single credit creates binary risk.', severity: 'H' },
      { id: 'vintage_concentration', label: 'Over 40% deployed in single vintage year', description: 'Vintage concentration amplifies credit cycle risk.', severity: 'M' },
      { id: 'leverage_creep', label: 'Fund-level leverage exceeding 1.5x', description: 'Excess leverage amplifies credit losses in downturns.', severity: 'H' },
    ],
  },

  'Hedge Funds': {
    label: 'Hedge Funds — Initial Screen',
    bucketLabels: { returns: 'Returns & Risk-Adjusted Performance', process: 'Strategy & Risk Management', people: 'People & Alignment' },
    criteria: [
      { id: 's1_sharpe', label: 'Sharpe Ratio vs. Peer Cohort', what_to_look_for: 'Net Sharpe ratio vs. HFRI strategy index. >1.0 Sharpe across full cycle = top quartile.', bucket: 'returns' },
      { id: 's1_drawdown', label: 'Max Drawdown & Recovery', what_to_look_for: 'Peak-to-trough drawdown vs. peers; months to recover; behavior in 2008, 2020, 2022.', bucket: 'returns' },
      { id: 's1_correlation', label: 'Correlation to S&P 500', what_to_look_for: 'Rolling 3-year correlation to equity beta. <0.3 = meaningful diversification benefit.', bucket: 'returns' },
      { id: 's1_strategy_clarity', label: 'Strategy Clarity & Repeatability', what_to_look_for: 'Is the edge clearly defined and repeatable? Avoid black-box strategies without attribution.', bucket: 'process' },
      { id: 's1_risk_mgmt', label: 'Risk Management Framework', what_to_look_for: 'Position sizing rules; stop-loss discipline; VaR limits; independent risk oversight.', bucket: 'process' },
      { id: 's1_pm', label: 'Portfolio Manager Experience & Track Record', what_to_look_for: 'Full-cycle track record (>7 years); performance attributable to named PM.', bucket: 'people' },
      { id: 's1_fee_liquidity', label: 'Fee Structure & Liquidity Terms', what_to_look_for: 'Management + performance fee vs. peers; lock-up vs. strategy liquidity; gates and side pockets.', bucket: 'people' },
    ],
    flags: [
      { id: 'strategy_drift', label: 'Strategy / style drift detected', description: 'Fund investing outside stated mandate without LP consent.', severity: 'H' },
      { id: 'aum_growth', label: 'AUM growing faster than opportunity set', description: 'Scale destroying alpha generation ability.', severity: 'M' },
      { id: 'pm_departure', label: 'Named PM departure or succession risk', description: 'Loss of key investment decision-maker.', severity: 'H' },
      { id: 'liquidity_mismatch', label: 'Portfolio liquidity shorter than redemption terms', description: 'Structural mismatch creates liquidity crisis risk.', severity: 'H' },
    ],
  },

  'Managed Futures': {
    label: 'Managed Futures — Initial Screen',
    bucketLabels: { returns: 'Returns & Crisis Alpha', process: 'Model & Execution', people: 'People & Alignment' },
    criteria: [
      { id: 's1_sharpe_cta', label: 'Sharpe Ratio (Full Cycle)', what_to_look_for: 'Net Sharpe >0.6 across full cycle including flat/choppy regimes. >1.0 = exceptional.', bucket: 'returns' },
      { id: 's1_crisis_alpha', label: 'Crisis Alpha & Equity Decorrelation', what_to_look_for: 'Positive returns during equity drawdowns (2008, 2020, 2022). Correlation to S&P < -0.1.', bucket: 'returns' },
      { id: 's1_dd_recovery', label: 'Max Drawdown & Recovery Time', what_to_look_for: 'Max drawdown vs. SG CTA Index; months to recovery.', bucket: 'returns' },
      { id: 's1_model_robust', label: 'Model Robustness & Backtest Quality', what_to_look_for: 'Live track record vs. backtest; parameter sensitivity; not overfit to single regime.', bucket: 'process' },
      { id: 's1_markets', label: 'Market Coverage & Diversification', what_to_look_for: 'Number of markets traded (>50 = well diversified); sector and geographic spread.', bucket: 'process' },
      { id: 's1_research', label: 'Research Team & Model Evolution', what_to_look_for: 'Dedicated R&D team; evidence of model improvement without overfitting.', bucket: 'people' },
      { id: 's1_capacity', label: 'Fee Structure & Capacity Discipline', what_to_look_for: 'Management + incentive fees vs. SG CTA Index peers; stated capacity limits and adherence.', bucket: 'people' },
    ],
    flags: [
      { id: 'backtest_overfit', label: 'Backtest significantly outperforms live track record', description: 'Model overfitting to historical data.', severity: 'H' },
      { id: 'regime_sensitivity', label: 'Strategy performs in single market regime only', description: 'Returns dependent on trending markets; will struggle in mean-reverting environments.', severity: 'M' },
      { id: 'capacity_breach', label: 'AUM approaching or exceeding stated capacity', description: 'Market impact costs destroying edge.', severity: 'M' },
      { id: 'model_opacity', label: 'Black-box model with no attribution transparency', description: 'Unable to assess source of returns or risk.', severity: 'H' },
    ],
  },

  'Private Real Estate': {
    label: 'Private Real Estate — Initial Screen',
    bucketLabels: { returns: 'Returns & Income Delivery', process: 'Process & Market Selection', people: 'People & Alignment' },
    criteria: [
      { id: 's1_re_irr', label: 'IRR & Equity Multiple vs. Vintage-Year Peers', what_to_look_for: 'Net returns vs. NCREIF/MSCI Real Estate same-vintage and strategy cohort.', bucket: 'returns' },
      { id: 's1_cash_yield', label: 'Cash Yield & NOI vs. Underwriting', what_to_look_for: 'Actual income return vs. acquisition underwriting; measures asset management execution quality.', bucket: 'returns' },
      { id: 's1_caprate', label: 'Cap Rate & Leverage Discipline', what_to_look_for: 'Entry cap rate vs. market; LTV discipline; avoids compressed-cap-rate peak deployment.', bucket: 'returns' },
      { id: 's1_market_sel', label: 'Market & Submarket Selection', what_to_look_for: 'Evidence of superior market timing and submarket identification; off-market sourcing.', bucket: 'process' },
      { id: 's1_asset_mgmt', label: 'Asset Management & Operating Platform', what_to_look_for: 'In-house vs. third-party; occupancy track record; NOI delivery vs. acquisition pro forma.', bucket: 'process' },
      { id: 's1_re_team', label: 'Investment & Asset Mgmt Team Depth', what_to_look_for: 'Acquisitions, asset management, and development team stability and relevant experience.', bucket: 'people' },
      { id: 's1_re_gp', label: 'GP Commitment & Reporting Transparency', what_to_look_for: 'GP commit ≥1%; quarterly property-level reporting; audited NAV; appraisal independence.', bucket: 'people' },
    ],
    flags: [
      { id: 'peak_deploy', label: 'Deploying at compressed cap rates / peak', description: 'Acquiring assets with thin margin of safety on return assumptions.', severity: 'H' },
      { id: 'dev_concentration', label: 'Development concentration >40% of fund', description: 'Ground-up development creates J-curve and execution risk.', severity: 'M' },
      { id: 'structural_demand', label: 'Structural demand risk (office / retail)', description: 'Underwriting does not adequately account for secular demand shifts.', severity: 'H' },
      { id: 'sponsor_stress', label: 'Sponsor balance sheet stress', description: 'GP financial stability concerns reduce ability to support portfolio.', severity: 'H' },
    ],
  },

  'Energy': {
    label: 'Energy — Initial Screen',
    bucketLabels: { returns: 'Returns & Commodity Risk', process: 'Process & Operations', people: 'People & Alignment' },
    criteria: [
      { id: 's1_en_irr', label: 'IRR & MOIC vs. Vintage-Year Peers', what_to_look_for: 'Net returns vs. Cambridge energy cohort. Stress-test: return profile at -25% commodity price.', bucket: 'returns' },
      { id: 's1_hedging', label: 'Hedging Coverage & Price Realization', what_to_look_for: '% of near-term production hedged; realized price vs. strip; downside protection track record.', bucket: 'returns' },
      { id: 's1_reserves', label: 'Reserve Quality & F&D Cost', what_to_look_for: 'PV-10 coverage vs. debt; independent reserve engineer quality; finding & development cost trend.', bucket: 'returns' },
      { id: 's1_tech_exp', label: 'Technical Expertise & Operational Control', what_to_look_for: 'In-house geology and engineering; operated vs. non-operated; cost and timing control.', bucket: 'process' },
      { id: 's1_permitting', label: 'Community, Permitting & Regulatory Track Record', what_to_look_for: 'Permit approval track record; relationships with state and federal regulators.', bucket: 'process' },
      { id: 's1_tech_team', label: 'Technical Team Stability', what_to_look_for: 'Retention of lead geologist, reservoir engineers, and land team; institutional knowledge risk.', bucket: 'people' },
      { id: 's1_en_gp', label: 'GP Commitment & Regulatory Compliance', what_to_look_for: 'GP commit ≥1–2%; no material spills, violations, or enforcement actions.', bucket: 'people' },
    ],
    flags: [
      { id: 'commodity_assumptions', label: 'Commodity price assumptions above strip', description: 'Return math is price-dependent; not viable at current strip.', severity: 'H' },
      { id: 'env_liability', label: 'Environmental / regulatory tail risk', description: 'Legacy liabilities or permit issues not fully reserved.', severity: 'H' },
      { id: 'tech_departure', label: 'Key technical expert departure risk', description: 'Loss of lead geologist or reservoir engineer.', severity: 'H' },
      { id: 'basin_concentration', label: 'Single-basin concentration risk', description: 'Over-concentration in single geography amplifies regulatory and price risk.', severity: 'M' },
    ],
  },

  'Crypto Assets': {
    label: 'Crypto Assets — Initial Screen',
    bucketLabels: { returns: 'Returns & Risk-Adjusted Performance', process: 'Strategy & Security', people: 'People & Alignment' },
    criteria: [
      { id: 's1_crypto_ret', label: 'Risk-Adjusted Returns vs. BTC/ETH Benchmark', what_to_look_for: 'Sharpe ratio vs. BTC and ETH buy-and-hold. Active management must justify fees vs. passive.', bucket: 'returns' },
      { id: 's1_crypto_dd', label: 'Drawdown & Recovery vs. Crypto Cycle', what_to_look_for: 'Peak-to-trough drawdown in bear markets (2018, 2022); recovery pace vs. broad crypto index.', bucket: 'returns' },
      { id: 's1_regulatory', label: 'Regulatory Clarity & Jurisdiction', what_to_look_for: 'Licensed in reputable jurisdiction; legal opinions on holdings; no enforcement actions.', bucket: 'process' },
      { id: 's1_custody', label: 'Custody & Security Maturity', what_to_look_for: 'Institutional-grade custody (Coinbase Prime, Anchorage, Fireblocks); SOC 2 audit; insurance.', bucket: 'process' },
      { id: 's1_crypto_strategy', label: 'Strategy Clarity & Repeatability', what_to_look_for: 'Clear alpha source (arbitrage, staking, L1/L2 thesis); not dependent on single cycle narrative.', bucket: 'process' },
      { id: 's1_crypto_team', label: 'Team Technical Depth', what_to_look_for: 'Engineers and developers on team; on-chain analysis capability; crypto-native experience.', bucket: 'people' },
      { id: 's1_crypto_terms', label: 'Terms, Liquidity & Fee Structure', what_to_look_for: 'Redemption terms vs. underlying liquidity; management + performance fee vs. peers.', bucket: 'people' },
    ],
    flags: [
      { id: 'reg_risk', label: 'Unresolved regulatory or enforcement risk', description: 'Active SEC/CFTC investigation or enforcement action.', severity: 'H' },
      { id: 'custody_concern', label: 'Self-custody or unregulated exchange exposure', description: 'Non-institutional custody creates binary loss risk.', severity: 'H' },
      { id: 'single_narrative', label: 'Returns dependent on single crypto narrative', description: 'Strategy only works in specific market regime.', severity: 'M' },
      { id: 'liquidity_mismatch_crypto', label: 'Illiquid holdings vs. liquid redemption terms', description: 'Structural mismatch creates forced selling risk.', severity: 'H' },
    ],
  },

  'Opportunistic': {
    label: 'Opportunistic — Initial Screen',
    bucketLabels: { returns: 'Returns & Thesis Validation', process: 'Process & Repeatability', people: 'People & Alignment' },
    criteria: [
      { id: 's1_opp_ret', label: 'Return vs. Risk Profile', what_to_look_for: 'IRR or Sharpe vs. comparable opportunity benchmark; asymmetric payoff vs. drawdown risk.', bucket: 'returns' },
      { id: 's1_thesis', label: 'Thesis Conviction & Market Timing', what_to_look_for: 'Is the opportunity time-bound and clearly mispriced? Evidence of similar successful past calls.', bucket: 'returns' },
      { id: 's1_downside', label: 'Downside Protection', what_to_look_for: 'Structural protections (senior secured, collateral, covenants); base case vs. stress case.', bucket: 'returns' },
      { id: 's1_repeatability', label: 'Strategy Repeatability', what_to_look_for: 'Is this a one-off bet or part of a repeatable playbook? Prefer teams with 2+ prior cycles.', bucket: 'process' },
      { id: 's1_pivot', label: 'Willingness to Pivot if Thesis Breaks', what_to_look_for: 'Evidence of disciplined exit when thesis invalidated; no anchoring to sunk cost.', bucket: 'process' },
      { id: 's1_opp_team', label: 'Team Expertise in Specific Opportunity', what_to_look_for: 'Deep domain expertise in the specific asset type; not generalist team chasing yield.', bucket: 'people' },
      { id: 's1_opp_align', label: 'GP Alignment & Fee Structure', what_to_look_for: 'GP co-invest meaningful relative to fund size; hurdle rate; no fee on undeployed capital.', bucket: 'people' },
    ],
    flags: [
      { id: 'thesis_unclear', label: 'Investment thesis unclear or not time-bound', description: 'Lack of clear catalyst or exit trigger.', severity: 'H' },
      { id: 'no_downside_prot', label: 'Limited downside protection or collateral', description: 'Asymmetric risk without structural protections.', severity: 'H' },
      { id: 'generalist_team', label: 'Generalist team without specific domain expertise', description: 'Team lacks relevant experience for this opportunity type.', severity: 'M' },
      { id: 'sunk_cost', label: 'Evidence of anchoring or sunk cost behavior', description: 'GP unwilling to cut losses when thesis breaks.', severity: 'M' },
    ],
  },
}

// ── STAGE 2 SCORING CONFIG (Detailed Underwriting) ─────────────────────────
// Sections: quant, risk, process, org, terms
// Note: ESG criteria removed throughout

export const STAGE2_CONFIG: Record<string, any> = {

  'Buyout': {
    label: 'Buyout Manager — Full Underwriting',
    defaultWeights: { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark all metrics vs. vintage-year peer median (Cambridge/Burgiss). Discount quantitative scores for funds in J-curve phase (years 1–3).',
        criteria: [
          { id: 'irr_peer', label: 'IRR vs. Vintage-Year Peer Median', guidance: '5=Top decile (>P90) | 4=Top quartile (P75–90) | 3=Median (P40–75) | 2=Below median (P25–40) | 1=Bottom quartile (<P25)', weight: 0.25 },
          { id: 'moic_peer', label: 'MOIC vs. Vintage-Year Peer Median', guidance: '5=>2.5x | 4=2.0–2.5x | 3=1.7–2.0x | 2=1.4–1.7x | 1=<1.4x. Discount if DPI is minimal.', weight: 0.20 },
          { id: 'pme', label: 'PME vs. Relevant Public Index (KS-PME)', guidance: '5=KS-PME >1.30x | 4=1.15–1.30x | 3=1.00–1.15x | 2=0.85–1.00x | 1=<0.85x. Index: R2000.', weight: 0.20 },
          { id: 'dpi_tvpi', label: 'DPI / TVPI / RVPI Progression', guidance: '5=DPI >1.0x with TVPI >2.0x | 4=DPI 0.75–1.0x | 3=DPI 0.50–0.75x | 2=DPI <0.5x | 1=DPI near zero in harvest phase.', weight: 0.20 },
          { id: 'loss_ratio', label: 'Loss Ratio / Write-Down Rate', guidance: '5=<5% capital written off | 4=5–10% | 3=10–15% | 2=15–25% | 1=>25%.', weight: 0.15 },
          { id: 'entry_multiple', label: 'Entry EV/EBITDA Multiple Discipline', guidance: 'Scores consistency of entry valuation vs. peer transactions; avoids over-paying at peak cycle.', weight: 0 },
          { id: 'rev_ebitda_growth', label: 'Revenue & EBITDA Growth (Portfolio Cos.)', guidance: 'Organic revenue and margin improvement across realized investments.', weight: 0 },
          { id: 'exit_multiple', label: 'Exit EV/EBITDA Multiple Realization', guidance: 'Ability to realize exits at or above underwritten multiples.', weight: 0 },
          { id: 'recap_discipline', label: 'Dividend Recapitalization Discipline', guidance: 'Excessive recap activity can inflate IRR while masking weak MOIC; evaluate frequency and scale.', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'leverage_disc', label: 'Leverage Discipline (Entry Debt/EBITDA)', guidance: 'Consistent leverage vs. market; avoids over-levering to boost IRR at expense of downside risk.', weight: 0 },
          { id: 'covenant_risk', label: 'Covenant & Liquidity Risk Management', guidance: 'Track record managing portfolio companies through covenant stress; use of amendments and PIK.', weight: 0 },
          { id: 'port_concentration', label: 'Portfolio Concentration (Single Asset >20% NAV)', guidance: 'No single investment should exceed 20–25% of fund NAV without compelling justification.', weight: 0 },
          { id: 'rate_risk', label: 'Interest Rate & Refinancing Exposure', guidance: 'Floating-rate debt exposure; near-term debt maturity wall risk; hedge ratio adequacy.', weight: 0 },
          { id: 'sector_geo_conc', label: 'Sector / Geographic Concentration', guidance: 'Diversification vs. stated mandate; avoids correlated bets within same fund vintage.', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'prop_sourcing', label: 'Proprietary Sourcing — % Off-Market Deals', guidance: 'Share of deals sourced outside competitive auctions; sponsor relationships, intermediary network.', weight: 0.25 },
          { id: 'mgmt_upgrade', label: 'Management Team Assessment & Upgrade Track Record', guidance: 'Documented history of CEO/CFO upgrades post-acquisition; executive network depth.', weight: 0.25 },
          { id: 'value_creation', label: '100-Day Plan / Operational Value Creation Playbook', guidance: 'Written, repeatable operational playbook; deployment of operating partners.', weight: 0.25 },
          { id: 'addon_execution', label: 'Add-On / Buy-and-Build Execution Quality', guidance: 'Platform acquisition + bolt-on strategy; integration track record; synergy realization.', weight: 0 },
          { id: 'exit_prep', label: 'Exit Preparation & Process Discipline', guidance: 'Quality of sell-side preparation; banker selection; auction vs. negotiated; timing discipline.', weight: 0.15 },
          { id: 'port_construction', label: 'Portfolio Construction & Capital Pacing', guidance: 'Steady deployment pace; avoids front-loading or over-concentrating in single vintage year.', weight: 0.10 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'team_stability', label: 'Investment Team Stability & Bench Depth', guidance: 'Senior partner turnover; VP/associate pipeline; average tenure at firm.', weight: 0 },
          { id: 'succession', label: 'Succession Planning', guidance: 'Clear next-generation leadership identified; documented transition plan for key partners.', weight: 0 },
          { id: 'gp_commit', label: 'GP Commitment (% of Fund Size)', guidance: 'Minimum 1% preferred; 2–3% considered best practice; funded in cash not management fee waiver.', weight: 0 },
          { id: 'carry_align', label: 'Carry Structure & Vesting Alignment', guidance: 'Whole-fund vs. deal-by-deal; multi-year vesting; clawback provisions; escrow adequacy.', weight: 0 },
          { id: 'ownership_gov', label: 'Ownership & Governance Stability', guidance: 'Institutional vs. individual GP ownership; recent or pending ownership changes; LPAC structure.', weight: 0 },
          { id: 'compliance', label: 'Compliance & Regulatory Track Record', guidance: 'No material SEC, CFTC, or foreign regulatory actions; clean Form ADV history.', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'keyman_s2', label: 'Key Man / Partner Departure Risk', description: 'Single partner drives >50% of sourcing or deal decisions; no named successor.', severity: 'H' },
      { id: 'mandate_drift_s2', label: 'Strategy / Mandate Drift', description: 'Fund investing outside stated geography, sector, or company size without LP consent.', severity: 'H' },
      { id: 'aum_vs_dealflow', label: 'Fund Size Growing Faster Than Deal Flow', description: 'AUM scaling materially ahead of team growth and market opportunity.', severity: 'M' },
      { id: 'portfolio_stress', label: 'Portfolio Company Stress Concentration (≥3 on Watch)', description: 'Three or more portfolio companies in amendment, covenant waiver, or active distress.', severity: 'H' },
    ],
  },

  'Private Real Estate': {
    label: 'Private Real Estate — Full Underwriting',
    defaultWeights: { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark all metrics vs. vintage-year peer median (Cambridge/Burgiss/NCREIF). Discount quantitative scores for funds in J-curve phase.',
        criteria: [
          { id: 're_irr_peer', label: 'IRR vs. Vintage-Year Peer Median', guidance: '5=Top decile (>P90) | 4=Top quartile (P75–90) | 3=Median (P40–75) | 2=Below median | 1=Bottom quartile', weight: 0.25 },
          { id: 're_moic_peer', label: 'MOIC vs. Vintage-Year Peer Median', guidance: '5=>2.5x | 4=2.0–2.5x | 3=1.7–2.0x | 2=1.4–1.7x | 1=<1.4x', weight: 0.20 },
          { id: 're_pme', label: 'PME vs. Relevant Public Index (KS-PME)', guidance: '5=KS-PME >1.30x | 4=1.15–1.30x | 3=1.00–1.15x | 2=0.85–1.00x | 1=<0.85x', weight: 0.20 },
          { id: 're_dpi_tvpi', label: 'DPI / TVPI / RVPI Progression', guidance: '5=DPI >1.0x with TVPI >2.0x | 4=DPI 0.75–1.0x | 3=DPI 0.50–0.75x | 2=DPI <0.5x | 1=near zero', weight: 0.20 },
          { id: 're_loss', label: 'Loss Ratio / Write-Down Rate', guidance: '5=<5% capital written off | 4=5–10% | 3=10–15% | 2=15–25% | 1=>25%', weight: 0.15 },
          { id: 're_cash_yield', label: 'Cash Yield / Current Income Return', guidance: 'Annual income / invested capital; compare to underwriting.', weight: 0 },
          { id: 're_caprate', label: 'Cap Rate at Acquisition vs. Market', guidance: 'Entry cap rate discipline vs. prevailing market cap rates.', weight: 0 },
          { id: 're_occupancy', label: 'Occupancy Rate (Weighted Portfolio Average)', guidance: 'Below 90% warrants scrutiny in most sectors; assess vs. submarket comparables.', weight: 0 },
          { id: 're_noi_growth', label: 'NOI Growth vs. Underwritten at Exit', guidance: 'Actual NOI at disposition vs. acquisition underwriting; measures asset management execution.', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 're_prop_conc', label: 'Property Type Concentration Risk', guidance: 'Over-indexing to single asset class vs. mandate.', weight: 0 },
          { id: 're_geo_conc', label: 'Geographic Concentration Risk', guidance: 'Single-market over-weight; gateway vs. secondary market exposure balance.', weight: 0 },
          { id: 're_leverage', label: 'Leverage Discipline (LTV at Entry)', guidance: 'LTV % vs. mandate; floating-rate debt exposure; cap and interest rate hedge adequacy.', weight: 0 },
          { id: 're_refi_risk', label: 'Refinancing & Debt Maturity Wall Risk', guidance: 'Debt maturity schedule vs. exit horizon; ability to refinance in stressed credit environments.', weight: 0 },
          { id: 're_dev_risk', label: 'Development / Entitlement Execution Risk', guidance: 'Concentration in ground-up development vs. income-producing; permitting track record.', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 're_mkt_sel', label: 'Market Selection & Timing Framework', guidance: 'Evidence that macro view translates to superior market selection; submarket entry timing.', weight: 0 },
          { id: 're_underwriting', label: 'Asset-Level Underwriting Rigor', guidance: 'Conservative vs. aggressive assumptions; sensitivity analysis quality; scenario stress testing.', weight: 0 },
          { id: 're_dev_execution', label: 'Development & Repositioning Execution Track Record', guidance: 'Value-add and opportunistic: delivered vs. underwritten outcomes across prior funds.', weight: 0 },
          { id: 're_prop_mgmt', label: 'Property Management & Operating Platform', guidance: 'In-house vs. third-party; control over NOI and tenant relationships; occupancy track record.', weight: 0 },
          { id: 're_exit_exec', label: 'Exit Execution & Buyer Universe Access', guidance: 'Breadth of buyer relationships; institutional vs. retail exit quality; realized vs. underwritten cap rate.', weight: 0 },
          { id: 're_debt_access', label: 'Debt Capital Markets Relationships', guidance: 'Access to competitively priced, appropriately structured debt; lender diversity.', weight: 0 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 're_team_depth', label: 'Investment & Asset Management Team Depth', guidance: 'Acquisitions, asset management, and development team stability and seniority.', weight: 0 },
          { id: 're_sourcing_rel', label: 'Off-Market Sourcing Relationships', guidance: 'Quality and exclusivity of broker, owner, and developer relationships.', weight: 0 },
          { id: 're_gp_commit', label: 'GP Commitment (% of Fund)', guidance: 'Minimum 1%; higher expected for value-add and opportunistic given execution risk.', weight: 0 },
          { id: 're_compliance', label: 'Compliance — Securities Law & Structure', guidance: 'No material regulatory or compliance issues; proper fund structure for strategy.', weight: 0 },
          { id: 're_reporting', label: 'Reporting Quality & Transparency', guidance: 'Quarterly property-level reporting; audited NAV; appraisal independence.', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 're_peak_val', label: 'Deploying at Peak Valuations / Compressed Cap Rates', description: 'Evidence of acquiring assets when market cap rates leave thin return margin of safety.', severity: 'H' },
      { id: 're_dev_conc', label: 'Development Concentration Risk', description: 'High proportion of fund in ground-up development vs. income-producing.', severity: 'M' },
      { id: 're_demand_disruption', label: 'Structural Demand Disruption (Office / Retail)', description: 'Underwriting does not adequately account for secular demand shifts.', severity: 'H' },
      { id: 're_sponsor_stress', label: 'Sponsor Liquidity or Balance Sheet Stress', description: 'Adverse news on GP firm financial stability.', severity: 'H' },
    ],
  },

  'Energy': {
    label: 'Energy — Full Underwriting',
    defaultWeights: { quant: 0.45, risk: 0.20, process: 0.25, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark all metrics vs. vintage-year peer median (Cambridge). Discount J-curve phase funds.',
        criteria: [
          { id: 'en_irr_peer', label: 'IRR vs. Vintage-Year Peer Median', guidance: '5=Top decile (>P90) | 4=Top quartile (P75–90) | 3=Median | 2=Below median | 1=Bottom quartile', weight: 0.25 },
          { id: 'en_moic_peer', label: 'MOIC vs. Vintage-Year Peer Median', guidance: '5=>2.5x | 4=2.0–2.5x | 3=1.7–2.0x | 2=1.4–1.7x | 1=<1.4x', weight: 0.20 },
          { id: 'en_pme', label: 'PME vs. Relevant Public Index (KS-PME)', guidance: '5=KS-PME >1.30x | 4=1.15–1.30x | 3=1.00–1.15x | 2=0.85–1.00x | 1=<0.85x', weight: 0.20 },
          { id: 'en_dpi_tvpi', label: 'DPI / TVPI / RVPI Progression', guidance: '5=DPI >1.0x with TVPI >2.0x | 4=DPI 0.75–1.0x | 3=DPI 0.50–0.75x | 2=DPI <0.5x | 1=near zero', weight: 0.20 },
          { id: 'en_loss', label: 'Loss Ratio / Write-Down Rate', guidance: '5=<5% capital written off | 4=5–10% | 3=10–15% | 2=15–25% | 1=>25%', weight: 0.15 },
          { id: 'en_rbl', label: 'Reserve-Based Lending Coverage (PV-10 vs. Debt)', guidance: 'Proved reserve value vs. outstanding debt; independent reserve engineer quality.', weight: 0 },
          { id: 'en_fd_cost', label: 'Finding & Development (F&D) Cost per BOE', guidance: 'Cost efficiency of adding proved reserves; trend over multiple funds is most informative.', weight: 0 },
          { id: 'en_hedging', label: 'Hedging Coverage (% of Production, Years 1–2)', guidance: '% of near-term production hedged; price floor vs. cash breakeven; hedge counterparty quality.', weight: 0 },
          { id: 'en_realized_price', label: 'Realized Price vs. Commodity Strip at Investment', guidance: 'Ability to outperform commodity strip through basis optimization and marketing.', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'en_price_sensitivity', label: 'Commodity Price Sensitivity (IRR at -25% Scenario)', guidance: 'What does the return profile look like at a sustained -25% commodity price shock?', weight: 0 },
          { id: 'en_hedge_consistency', label: 'Hedging Policy Execution & Consistency', guidance: 'Consistency of hedging program across funds; downside protection track record.', weight: 0 },
          { id: 'en_basin_conc', label: 'Basin / Resource Concentration Risk', guidance: 'Single-basin or single-commodity over-concentration vs. mandate.', weight: 0 },
          { id: 'en_env_liability', label: 'Environmental Liability Exposure', guidance: 'Legacy plugging obligations, spill/contamination history, Superfund site proximity.', weight: 0 },
          { id: 'en_transition_risk', label: 'Energy Transition / Stranded Asset Risk', guidance: 'Long-dated proved reserves vs. energy transition timeline; carbon cost sensitivity in underwriting.', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'en_geo_eng', label: 'Geological & Engineering Expertise (In-House)', guidance: 'In-house reservoir, production, and facilities engineering vs. reliance on outside consultants.', weight: 0 },
          { id: 'en_acq_drill', label: 'Acquisition vs. Drilling / Development Mix', guidance: 'Risk profile of deployed capital; operated vs. non-operated determines cost control.', weight: 0 },
          { id: 'en_operator', label: 'Operator vs. Non-Operator Field Strategy', guidance: 'Operated assets provide cost/timing control but require greater technical depth.', weight: 0 },
          { id: 'en_permitting', label: 'Community, Permitting & Regulatory Engagement', guidance: 'Permit approval track record; relationships with state and federal regulators; community impact.', weight: 0 },
          { id: 'en_exit_flex', label: 'Exit Strategy Flexibility (Trade Sale vs. IPO)', guidance: 'Buyer universe depth; IPO market access for energy assets; MLP/royalty trust exit optionality.', weight: 0 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'en_tech_depth', label: 'Technical Team Depth (Geology & Engineering)', guidance: 'In-house reservoir, production, land, and facilities engineering staff quality and retention.', weight: 0 },
          { id: 'en_land_exp', label: 'Land & Mineral Rights Expertise', guidance: 'Track record in lease acquisition; title work quality; avoidance of title defects at exit.', weight: 0 },
          { id: 'en_gp_commit', label: 'GP Commitment & Alignment', guidance: 'Minimum 1–2%; GP co-investment alongside fund is common in energy.', weight: 0 },
          { id: 'en_compliance', label: 'Regulatory Compliance History', guidance: 'No material spills, regulatory enforcement actions, or OSHA violations.', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'en_price_optim', label: 'Commodity Price Assumption Optimism', description: 'Underwriting assumes sustained prices materially above current strip.', severity: 'H' },
      { id: 'en_env_tail', label: 'Environmental / Regulatory Tail Risk', description: 'Legacy liabilities or permit issues not fully reserved.', severity: 'H' },
      { id: 'en_tech_departure', label: 'Key Technical Expert Departure Risk', description: 'Loss of lead geologist or reservoir engineer with disproportionate institutional knowledge.', severity: 'H' },
      { id: 'en_transition_denial', label: 'Energy Transition Strategy Freeze', description: 'No visible strategy adaptation to long-dated carbon risk.', severity: 'M' },
    ],
  },
}

// Fund Terms & Alignment scorecard (strategy-agnostic)
export const FUND_TERMS_CONFIG = {
  label: 'Fund Terms & Alignment',
  note: 'Score each term vs. ILPA Principles 3.0 (2019) market standards. 1 = LP-unfavorable | 3 = Market standard | 5 = LP-favorable best practice',
  sections: {
    economics: {
      label: 'Economics & Fees',
      criteria: [
        { id: 'mgmt_fee_committed', label: 'Management Fee — Committed Capital Phase', guidance: '5=≤1.25% | 4=1.5% | 3=1.75% | 2=2.0% | 1=>2.0% on committed capital', priority: 'H' },
        { id: 'mgmt_fee_invested', label: 'Management Fee — Invested Capital Phase', guidance: '5=Stepdown + reduced rate | 4=Stepdown to invested | 3=Committed (no stepdown) | 2–1=Remains high', priority: 'H' },
        { id: 'fee_offsets', label: 'Fee Offsets — Transaction & Monitoring Fees', guidance: '5=100% offset | 4=80% | 3=50% | 2=<50% | 1=No offset', priority: 'M' },
        { id: 'fee_waiver', label: 'Management Fee Waiver / GP Reinvestment', guidance: '5=Full fee waiver reinvested | 4=Partial | 3=No waiver but GP commits cash | 2–1=No meaningful reinvestment', priority: 'L' },
      ]
    },
    carry: {
      label: 'Carried Interest & Return Structure',
      criteria: [
        { id: 'carry_rate', label: 'Carried Interest Rate', guidance: '5=15–20% (BO/GE) | 4=20% | 3=20% with favorable terms | 2=25% | 1=>25% or deal-by-deal', priority: 'H' },
        { id: 'carry_structure', label: 'Carry Structure — Whole Fund vs. Deal-by-Deal', guidance: '5=Whole fund + clawback | 4=Whole fund, no clawback | 3=European waterfall | 2=Hybrid | 1=American/deal-by-deal', priority: 'H' },
        { id: 'hurdle_rate', label: 'Hurdle Rate / Preferred Return', guidance: '5=8% hard hurdle | 4=8% + full catch-up | 3=6% hurdle | 2=4–6% | 1=No hurdle or <4%', priority: 'H' },
        { id: 'catchup', label: 'Catch-Up Provision', guidance: '5=50/50 or no catch-up | 4=50/50 catch-up | 3=80/20 | 2=100% GP catch-up | 1=Accelerated', priority: 'M' },
        { id: 'clawback', label: 'Clawback Provision', guidance: '5=Full clawback + GP escrow | 4=Full clawback, no escrow | 3=Partial | 2=Soft clawback | 1=None', priority: 'H' },
      ]
    },
    alignment: {
      label: 'GP Commitment & Alignment',
      criteria: [
        { id: 'gp_commit_pct', label: 'GP Commitment (% of Fund Size)', guidance: '5=>3% GP commit | 4=2–3% | 3=1–2% | 2=0.5–1% | 1=<0.5% or via credit facility', priority: 'H' },
        { id: 'keyman_provisions', label: 'Key Man Provisions', guidance: '5=Strong key man, period suspends immediately | 4=Adequate | 3=Defined but narrow | 2=Weak | 1=None', priority: 'H' },
        { id: 'removal_rights', label: 'No-Fault Divorce / LP Removal Rights', guidance: '5=66% LP vote | 4=75% LP vote | 3=80%+ threshold | 2=Very high/impractical | 1=No removal right', priority: 'M' },
        { id: 'lpac', label: 'LPAC Rights & Governance', guidance: '5=Robust LPAC with strong rights | 4=Standard LPAC | 3=Advisory only | 2=Minimal rights | 1=No LPAC', priority: 'M' },
      ]
    },
    mechanics: {
      label: 'Fund Mechanics & Structure',
      criteria: [
        { id: 'invest_period', label: 'Investment Period Length & Extension', guidance: '5=4–5 years, extensions require LP vote | 4=5-year, GP discretion | 3=5-year + unilateral ext. | 2=6-year | 1=>6 years', priority: 'M' },
        { id: 'fund_term', label: 'Fund Term & Tail Extension Rights', guidance: '5=10+1+1 with LP vote | 4=10+2, GP discretion | 3=10+3 | 2=>12 years at GP discretion | 1=Indefinite', priority: 'M' },
        { id: 'recycling', label: 'Recycling Provisions', guidance: '5=Capped recycling, investment period only | 4=Reasonable | 3=Moderate | 2=Aggressive | 1=Unlimited', priority: 'L' },
        { id: 'coinvest_rights', label: 'Co-Investment Rights for LPs', guidance: '5=Pro-rata co-invest, adequate notice | 4=Co-invest at GP discretion | 3=Best-efforts | 2=Limited | 1=None', priority: 'M' },
        { id: 'distribution_currency', label: 'Distribution Waterfall Currency', guidance: '5=All cash | 4=Cash + narrow in-kind carve-out | 3=Mixed | 2=Frequent in-kind | 1=GP discretion / mostly in-kind', priority: 'L' },
      ]
    }
  }
}

// Track Record History structure
export const TRACK_RECORD_FIELDS = [
  { id: 'fund_name', label: 'Fund Name' },
  { id: 'vintage_year', label: 'Vintage Year' },
  { id: 'committed_mm', label: 'Committed Capital ($M)' },
  { id: 'invested_mm', label: 'Invested Capital ($M)' },
  { id: 'fund_status', label: 'Fund Status' },
  { id: 'gross_irr', label: 'Gross IRR' },
  { id: 'net_irr', label: 'Net IRR' },
  { id: 'gross_moic', label: 'Gross MOIC' },
  { id: 'net_moic', label: 'Net MOIC' },
  { id: 'dpi', label: 'DPI (x)' },
  { id: 'tvpi', label: 'TVPI (x)' },
  { id: 'pme', label: 'PME (KS-PME)' },
  { id: 'peer_median_irr', label: 'Peer Median Net IRR' },
  { id: 'peer_quartile', label: 'Peer Quartile' },
]

// ── ADDITIONAL STAGE 2 CONFIGS (merged into STAGE2_CONFIG) ──────────────────
Object.assign(STAGE2_CONFIG, {

  'Private Credit': {
    label: 'Private Credit — Full Underwriting',
    defaultWeights: { quant: 0.55, risk: 0.20, process: 0.15, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark vs. vintage-year peer median (Cliffwater, Preqin). Focus on loss-adjusted yield and default rates.',
        criteria: [
          { id: 'pc_yield_peer', label: 'Net Yield vs. Benchmark Spreads', guidance: '5=Top decile spread premium | 4=Top quartile | 3=Median | 2=Below median | 1=Bottom quartile vs. leveraged loan/HY index', weight: 0.25 },
          { id: 'pc_default_rate', label: 'Historical Default Rate vs. Market', guidance: '5=<0.5% annual default | 4=0.5–1.0% | 3=1.0–2.0% | 2=2.0–4.0% | 1=>4.0% annual default rate', weight: 0.25 },
          { id: 'pc_loss_rate', label: 'Loss-Given-Default / Recovery Rate', guidance: '5=>90% recovery | 4=80–90% | 3=70–80% | 2=60–70% | 1=<60% recovery on defaulted positions', weight: 0.20 },
          { id: 'pc_irr', label: 'Net IRR vs. Vintage-Year Peers', guidance: '5=Top decile | 4=Top quartile | 3=Median | 2=Below median | 1=Bottom quartile vs. Cliffwater/Preqin cohort', weight: 0.15 },
          { id: 'pc_dpi', label: 'DPI / Income Return Consistency', guidance: '5=Consistent quarterly distributions, DPI >0.8x | 4=Mostly consistent | 3=Occasional gaps | 2=Irregular | 1=Minimal income return', weight: 0.15 },
          { id: 'pc_concentration', label: 'Portfolio Concentration Risk', guidance: 'Single obligor <5%; sector <25%; vintage diversification adequate', weight: 0 },
          { id: 'pc_covenant_quality', label: 'Covenant Quality & Maintenance', guidance: 'Maintenance vs. incurrence covenants; covenant headroom trend; amendment frequency', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'pc_underwriting', label: 'Underwriting Rigor & Stress Testing', guidance: 'Depth of credit analysis; proprietary models; downside scenario discipline; DSCR sensitivity', weight: 0 },
          { id: 'pc_workout', label: 'Workout & Restructuring Track Record', guidance: 'Recovery rates on defaults; dedicated workout team; restructuring experience across cycles', weight: 0 },
          { id: 'pc_leverage', label: 'Fund-Level Leverage Discipline', guidance: '5=No fund leverage | 4=<0.5x | 3=0.5–1.0x | 2=1.0–1.5x | 1=>1.5x fund-level leverage', weight: 0 },
          { id: 'pc_rate_sensitivity', label: 'Interest Rate & Duration Sensitivity', guidance: 'Floating vs. fixed rate mix; duration mismatch vs. fund term; hedge adequacy', weight: 0 },
          { id: 'pc_vintage_conc', label: 'Vintage Year Concentration', guidance: 'Over-concentration in single origination vintage amplifies credit cycle risk', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'pc_orig_edge', label: 'Origination Edge & Deal Flow Quality', guidance: 'Proprietary vs. broadly syndicated; sponsor relationships; direct lending capability', weight: 0.40 },
          { id: 'pc_structuring', label: 'Deal Structuring Discipline', guidance: 'Attachment point discipline; covenant package; PIK vs. cash pay; OID and fee income', weight: 0.30 },
          { id: 'pc_portfolio_mgmt', label: 'Active Portfolio Management', guidance: 'Ongoing monitoring frequency; early warning systems; amendment negotiation track record', weight: 0.30 },
          { id: 'pc_market_cycle', label: 'Credit Cycle Awareness', guidance: 'Evidence of tightening standards at cycle peaks; pulling back from frothy markets', weight: 0 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'pc_team_depth', label: 'Credit Team Depth & Cycle Experience', guidance: 'Senior credit officer tenure; breadth of experience across 2008, 2020 credit cycles', weight: 0 },
          { id: 'pc_gp_commit', label: 'GP Commitment & Alignment', guidance: 'Management fee on invested (not committed); GP co-invest in deals; clawback provisions', weight: 0 },
          { id: 'pc_compliance', label: 'Regulatory & Compliance Track Record', guidance: 'No material SEC actions; clean Form ADV; BDC regulatory compliance if applicable', weight: 0 },
          { id: 'pc_reporting', label: 'Reporting Quality & Transparency', guidance: 'Loan-level reporting; NAV methodology; fair value policy; auditor quality', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'pc_cov_lite', label: 'Covenant Quality Eroding (Cov-Lite Creep)', description: 'Increasingly loose covenants reduce downside protection; cov-lite exposure rising.', severity: 'H' },
      { id: 'pc_single_obligor', label: 'Single Obligor >5% of Portfolio', description: 'Concentration in single credit creates binary risk.', severity: 'H' },
      { id: 'pc_fund_leverage', label: 'Fund-Level Leverage Exceeding 1.5x', description: 'Excess leverage amplifies credit losses in downturns.', severity: 'H' },
      { id: 'pc_vintage_conc_flag', label: 'Over 40% Deployed in Single Vintage Year', description: 'Vintage concentration amplifies credit cycle risk.', severity: 'M' },
    ],
  },

  'Hedge Funds': {
    label: 'Hedge Funds — Full Underwriting',
    defaultWeights: { quant: 0.50, risk: 0.20, process: 0.20, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark vs. relevant HFRI strategy index. Evaluate across full market cycles including 2008, 2020, 2022.',
        criteria: [
          { id: 'hf_sharpe', label: 'Sharpe Ratio vs. HFRI Strategy Index', guidance: '5=>1.5 Sharpe | 4=1.0–1.5 | 3=0.7–1.0 | 2=0.4–0.7 | 1=<0.4 vs. relevant HFRI sub-index', weight: 0.25 },
          { id: 'hf_alpha', label: 'Alpha Generation vs. Benchmark', guidance: '5=Consistent >5% annualized alpha | 4=3–5% | 3=1–3% | 2=0–1% | 1=Negative alpha', weight: 0.20 },
          { id: 'hf_drawdown', label: 'Max Drawdown vs. Peer Cohort', guidance: '5=Max DD <5% | 4=5–10% | 3=10–15% | 2=15–20% | 1=>20%. Compare to HFRI strategy index DD.', weight: 0.20 },
          { id: 'hf_correlation', label: 'Correlation to S&P 500 (Rolling 3yr)', guidance: '5=Correlation <0.1 | 4=0.1–0.2 | 3=0.2–0.3 | 2=0.3–0.5 | 1=>0.5. Meaningful diversification requires <0.3.', weight: 0.20 },
          { id: 'hf_sortino', label: 'Sortino Ratio & Downside Deviation', guidance: 'Sortino >2.0 = exceptional downside risk management. Compare to strategy peers.', weight: 0.15 },
          { id: 'hf_win_rate', label: 'Win Rate & Profit Factor', guidance: 'Win rate >55% with profit factor >1.5 = consistent edge. Evaluate across market regimes.', weight: 0 },
          { id: 'hf_capacity', label: 'AUM vs. Strategy Capacity', guidance: 'Evidence that current AUM does not impair alpha generation vs. peak strategy capacity', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'hf_risk_framework', label: 'Risk Management Framework Rigor', guidance: 'Independent risk function; VaR limits; position sizing rules; stop-loss discipline; stress testing', weight: 0 },
          { id: 'hf_liquidity', label: 'Portfolio Liquidity vs. Redemption Terms', guidance: 'Days-to-liquidate 90% of portfolio vs. fund redemption terms; liquidity stress testing', weight: 0 },
          { id: 'hf_leverage_use', label: 'Gross/Net Leverage Discipline', guidance: 'Gross leverage vs. strategy peers; net exposure management through cycles; leverage reduction in stress', weight: 0 },
          { id: 'hf_concentration_risk', label: 'Position Concentration Risk', guidance: 'Single position <10% of NAV; sector concentration vs. mandate; factor exposure diversification', weight: 0 },
          { id: 'hf_tail_risk', label: 'Tail Risk Management', guidance: 'Explicit tail hedging program; behavior in 2008, 2020, 2022; put protection or variance swap usage', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'hf_edge_clarity', label: 'Edge Clarity & Repeatability', guidance: 'Is the alpha source clearly defined, attributable, and repeatable? Avoid black-box without attribution.', weight: 0.35 },
          { id: 'hf_idea_gen', label: 'Idea Generation & Research Process', guidance: 'Proprietary research; differentiated data sources; structured investment process; idea filtering', weight: 0.30 },
          { id: 'hf_portfolio_construction', label: 'Portfolio Construction Discipline', guidance: 'Position sizing methodology; correlation management; rebalancing rules; factor exposure monitoring', weight: 0.25 },
          { id: 'hf_risk_adjusted_sizing', label: 'Risk-Adjusted Position Sizing', guidance: 'Kelly criterion or equivalent; conviction-weighted sizing; max loss per position discipline', weight: 0.10 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'hf_pm_track', label: 'PM Track Record Attribution', guidance: 'Performance clearly attributable to named PM; institutional vs. prop desk track record; full-cycle evidence', weight: 0 },
          { id: 'hf_team_stability', label: 'Team Stability & Succession', guidance: 'Analyst/PM retention; named backup for key PM; organizational depth beyond founder', weight: 0 },
          { id: 'hf_fee_terms', label: 'Fee Structure vs. HFRI Peers', guidance: '5=1/10 or better | 4=1.5/15 | 3=2/20 standard | 2=2/20+ with multi-year lock | 1=>2/20 with unfavorable terms', weight: 0 },
          { id: 'hf_ops_infra', label: 'Operational Infrastructure Quality', guidance: 'Prime broker quality; fund admin independence; cybersecurity; disaster recovery; SOC 2 audit', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'hf_strategy_drift', label: 'Strategy / Style Drift Detected', description: 'Fund investing outside stated mandate without LP consent; mandate creep.', severity: 'H' },
      { id: 'hf_pm_departure', label: 'Named PM Departure or Succession Risk', description: 'Loss of key investment decision-maker with no named successor.', severity: 'H' },
      { id: 'hf_liquidity_mismatch', label: 'Portfolio Liquidity Shorter Than Redemption Terms', description: 'Structural mismatch creates forced selling risk in redemption scenario.', severity: 'H' },
      { id: 'hf_aum_capacity', label: 'AUM Growing Faster Than Opportunity Set', description: 'Scale destroying alpha generation ability; returns declining as AUM grows.', severity: 'M' },
    ],
  },

  'Managed Futures': {
    label: 'Managed Futures / CTA — Full Underwriting',
    defaultWeights: { quant: 0.55, risk: 0.15, process: 0.20, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark vs. SG CTA Index and relevant sub-index. Evaluate crisis alpha specifically.',
        criteria: [
          { id: 'cta_sharpe', label: 'Sharpe Ratio (Full Cycle)', guidance: '5=>1.0 Sharpe | 4=0.75–1.0 | 3=0.5–0.75 | 2=0.25–0.5 | 1=<0.25 across full cycle including choppy regimes', weight: 0.25 },
          { id: 'cta_crisis_alpha', label: 'Crisis Alpha — Returns in Equity Drawdowns', guidance: '5=Strongly positive in 2008, 2020, 2022 | 4=Positive in 2 of 3 | 3=Flat | 2=Modest negative | 1=Large drawdown in crisis', weight: 0.25 },
          { id: 'cta_drawdown', label: 'Max Drawdown vs. SG CTA Index', guidance: '5=Max DD <10% | 4=10–15% | 3=15–20% | 2=20–25% | 1=>25% peak-to-trough', weight: 0.20 },
          { id: 'cta_correlation', label: 'Correlation to Equity & Bond Markets', guidance: '5=Near-zero or negative correlation to both | 4=Low positive (<0.1) | 3=Modest (0.1–0.2) | 2=0.2–0.3 | 1=>0.3', weight: 0.15 },
          { id: 'cta_live_vs_backtest', label: 'Live Track Record vs. Backtest', guidance: '5=>10yr live, matches backtest | 4=7–10yr live | 3=5–7yr live | 2=3–5yr live | 1=<3yr or large backtest/live gap', weight: 0.15 },
          { id: 'cta_regime_breadth', label: 'Performance Across Market Regimes', guidance: 'Trending, mean-reverting, and crisis regime performance; not single-regime dependent', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'cta_model_robust', label: 'Model Robustness & Overfitting Risk', guidance: 'Parameter sensitivity; walk-forward testing; out-of-sample performance vs. in-sample backtest', weight: 0 },
          { id: 'cta_market_breadth', label: 'Market Coverage & Diversification', guidance: '5=>100 markets | 4=75–100 | 3=50–75 | 2=25–50 | 1=<25 markets traded', weight: 0 },
          { id: 'cta_slippage', label: 'Slippage & Market Impact Control', guidance: 'Transaction cost modeling; AUM vs. market liquidity; capacity management discipline', weight: 0 },
          { id: 'cta_vol_targeting', label: 'Volatility Targeting Framework', guidance: 'Dynamic risk scaling; drawdown control mechanisms; vol regime adaptation', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'cta_research', label: 'R&D Team Quality & Model Evolution', guidance: 'Dedicated research team; evidence of model improvement without overfitting; peer-reviewed research', weight: 0.40 },
          { id: 'cta_execution', label: 'Execution Infrastructure & Technology', guidance: 'Low-latency execution; prime broker relationships; order management systems; disaster recovery', weight: 0.30 },
          { id: 'cta_transparency', label: 'Strategy Transparency & Attribution', guidance: 'Willingness to explain alpha sources at sector level; periodic attribution reporting to LPs', weight: 0.30 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'cta_team', label: 'Research & Technology Team Depth', guidance: 'Quant researchers, engineers, and traders; key person risk; institutional knowledge documentation', weight: 0 },
          { id: 'cta_capacity', label: 'Capacity Discipline & AUM Management', guidance: 'Stated capacity ceiling; history of closing to new investors; performance fee cliff management', weight: 0 },
          { id: 'cta_fees', label: 'Fee Structure vs. SG CTA Peers', guidance: '5=1/10 or better | 4=1.5/15 | 3=2/20 | 2=>2/20 | 1=High fees without demonstrable alpha justification', weight: 0 },
          { id: 'cta_ops', label: 'Operational Risk & Cybersecurity', guidance: 'Algorithmic trading safeguards; kill switch protocols; cybersecurity audits; SOC 2 compliance', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'cta_backtest_gap', label: 'Large Backtest/Live Performance Gap', description: 'Live returns significantly trail backtest — model overfitting to historical data.', severity: 'H' },
      { id: 'cta_single_regime', label: 'Strategy Only Works in Trending Markets', description: 'Returns concentrated in trending regime; mean-reverting periods show persistent losses.', severity: 'M' },
      { id: 'cta_capacity_breach', label: 'AUM Near or Exceeding Stated Capacity', description: 'Market impact costs destroying alpha; slippage increasing.', severity: 'M' },
      { id: 'cta_opacity', label: 'Black-Box Model — No Attribution Transparency', description: 'Unable to assess source of returns or risk factors driving performance.', severity: 'H' },
    ],
  },

  'Crypto Assets': {
    label: 'Crypto Assets — Full Underwriting',
    defaultWeights: { quant: 0.35, risk: 0.25, process: 0.25, org: 0.15 },
    sections: {
      quant: {
        label: 'Quantitative Performance',
        note: 'Benchmark vs. BTC/ETH buy-and-hold and relevant crypto indices. Active management must justify fees.',
        criteria: [
          { id: 'cr_sharpe', label: 'Sharpe Ratio vs. BTC/ETH Benchmark', guidance: '5=Sharpe >2.0 with significant alpha over BTC | 4=Sharpe 1.5–2.0 | 3=1.0–1.5 | 2=0.5–1.0 | 1=<0.5 or trails passive', weight: 0.30 },
          { id: 'cr_drawdown', label: 'Max Drawdown in Bear Markets (2018, 2022)', guidance: '5=<30% DD in crypto bear | 4=30–50% | 3=50–65% | 2=65–75% | 1=>75% or worse than market', weight: 0.25 },
          { id: 'cr_recovery', label: 'Recovery Speed vs. Crypto Market Cycle', guidance: 'Speed of recovery from peak drawdown vs. BTC recovery pace; active protection in downturns', weight: 0.20 },
          { id: 'cr_alpha', label: 'Alpha vs. Passive Crypto Benchmark', guidance: 'Net alpha over BTC/ETH 60/40 benchmark after fees. Active mgmt must demonstrate consistent edge.', weight: 0.25 },
          { id: 'cr_vol_adj', label: 'Volatility-Adjusted Return Profile', guidance: 'Lower vol than market with comparable or better returns; vol targeting or hedging effectiveness', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Portfolio Construction',
        criteria: [
          { id: 'cr_custody', label: 'Custody & Security Architecture', guidance: '5=Multi-sig, institutional (Coinbase Prime/Anchorage/Fireblocks), SOC2, insurance | 4=Institutional, 1 gap | 3=Mix | 2=Some self-custody | 1=Self-custody or CEX', weight: 0 },
          { id: 'cr_regulatory', label: 'Regulatory Clarity & Jurisdiction', guidance: '5=Licensed in top-tier jurisdiction, clean record | 4=Licensed, minor issues | 3=Licensing in progress | 2=Gray area | 1=Unregulated or enforcement risk', weight: 0 },
          { id: 'cr_counterparty', label: 'Counterparty & Exchange Risk', guidance: 'Exchange concentration; counterparty credit quality; use of DEX vs. CEX; collateral management', weight: 0 },
          { id: 'cr_liquidity_mgmt', label: 'Liquidity Management vs. Redemption Terms', guidance: 'Days-to-liquidate 90% of portfolio vs. fund redemption gate; illiquid allocation limits', weight: 0 },
          { id: 'cr_smart_contract', label: 'Smart Contract & Protocol Risk', guidance: 'Audit quality of protocols used; TVL concentration; upgrade/governance risk; exploit history', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Philosophy',
        criteria: [
          { id: 'cr_strategy_clarity', label: 'Strategy Clarity & Alpha Source', guidance: 'Clear edge: arbitrage, staking, L1/L2 thesis, market-making. Not dependent on single narrative.', weight: 0.35 },
          { id: 'cr_research', label: 'On-Chain Research Capability', guidance: 'Proprietary on-chain analytics; blockchain data infrastructure; token economic modeling', weight: 0.35 },
          { id: 'cr_risk_mgmt', label: 'Risk Management Framework', guidance: 'Stop-loss discipline; position limits; protocol exposure caps; drawdown triggers', weight: 0.30 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'cr_team_tech', label: 'Team Technical Depth (Engineering + Finance)', guidance: 'Blockchain engineers + traditional finance experience; on-chain development capability', weight: 0 },
          { id: 'cr_ops_security', label: 'Operational Security & Key Management', guidance: 'Multi-sig key management; hardware security modules; insider threat controls; insurance coverage', weight: 0 },
          { id: 'cr_fee_terms', label: 'Fee Structure & Liquidity Terms', guidance: 'Redemption terms vs. underlying liquidity; management + performance fee vs. crypto fund peers', weight: 0 },
          { id: 'cr_compliance_ops', label: 'Compliance Infrastructure', guidance: 'AML/KYC procedures; transaction monitoring; sanctions screening; regulatory reporting capability', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'cr_enforcement', label: 'Active Regulatory or Enforcement Action', description: 'SEC, CFTC, or foreign regulator investigation or enforcement action.', severity: 'H' },
      { id: 'cr_custody_risk', label: 'Self-Custody or Unregulated Exchange Exposure', description: 'Non-institutional custody or CEX concentration creates binary loss risk.', severity: 'H' },
      { id: 'cr_narrative_dep', label: 'Returns Dependent on Single Crypto Narrative', description: 'Strategy only works in specific market regime or token category cycle.', severity: 'M' },
      { id: 'cr_liq_mismatch', label: 'Illiquid Holdings vs. Liquid Redemption Terms', description: 'Structural mismatch creates forced selling and gating risk.', severity: 'H' },
    ],
  },

  'Opportunistic': {
    label: 'Opportunistic — Full Underwriting',
    defaultWeights: { quant: 0.45, risk: 0.20, process: 0.25, org: 0.10 },
    sections: {
      quant: {
        label: 'Quantitative Performance & Thesis Validation',
        note: 'Benchmark varies by specific opportunity — use closest comparable strategy. Stress test return thesis explicitly.',
        criteria: [
          { id: 'op_irr_target', label: 'IRR Target vs. Risk Profile', guidance: '5=High IRR with strong structural protection | 4=Good IRR, adequate protection | 3=Market return, standard risk | 2=Below market for risk | 1=Poor risk/return', weight: 0.30 },
          { id: 'op_downside', label: 'Downside Case Return Analysis', guidance: '5=Positive return in stress case | 4=Capital preservation in stress | 3=Modest loss in stress | 2=Material loss | 1=Total loss possible in stress', weight: 0.25 },
          { id: 'op_prior_track', label: 'Prior Similar Opportunity Track Record', guidance: '5=2+ prior cycles with strong outcomes | 4=1 prior cycle, strong | 3=Adjacent experience | 2=Limited | 1=First time in opportunity type', weight: 0.25 },
          { id: 'op_catalyst', label: 'Catalyst Clarity & Timeline', guidance: '5=Specific catalyst, defined timeline, high probability | 4=Clear catalyst, reasonable timeline | 3=Catalyst identified, uncertain timing | 2=Vague | 1=No clear catalyst', weight: 0.20 },
          { id: 'op_pme', label: 'PME vs. Closest Public Proxy', guidance: 'Where available, PME vs. closest public market equivalent for the opportunity type', weight: 0 },
        ]
      },
      risk: {
        label: 'Risk & Downside Protection',
        criteria: [
          { id: 'op_structural', label: 'Structural Downside Protection', guidance: 'Senior secured position; collateral coverage; covenant package; priority in capital structure', weight: 0 },
          { id: 'op_exit_options', label: 'Exit Strategy & Optionality', guidance: 'Multiple exit paths; buyer universe depth; not single-exit-dependent; secondary market access', weight: 0 },
          { id: 'op_key_risk', label: 'Key Risk Identification & Mitigation', guidance: 'Are the 2–3 key risks to the thesis clearly identified? Are mitigants specific and credible?', weight: 0 },
          { id: 'op_thesis_break', label: 'Thesis Break Protocol', guidance: 'Clear criteria for when thesis is invalidated; historical evidence of disciplined exit when wrong', weight: 0 },
        ]
      },
      process: {
        label: 'Process & Repeatability',
        criteria: [
          { id: 'op_domain_exp', label: 'Domain Expertise in Specific Opportunity', guidance: 'Deep expertise in this specific asset type — not generalist team chasing yield or narrative', weight: 0.40 },
          { id: 'op_playbook', label: 'Repeatable Playbook vs. One-Off Bet', guidance: 'Is this part of a repeatable investment process or a one-time opportunistic bet?', weight: 0.35 },
          { id: 'op_due_diligence', label: 'Due Diligence Process Quality', guidance: 'Depth of fundamental analysis; use of external experts; reference checking; site visits', weight: 0.25 },
        ]
      },
      org: {
        label: 'Organizational & People Risk',
        criteria: [
          { id: 'op_team_exp', label: 'Team Experience in This Opportunity Type', guidance: 'Direct prior experience; relevant operational or sector background; network access', weight: 0 },
          { id: 'op_gp_commit', label: 'GP Co-Investment & Alignment', guidance: 'GP commit meaningful relative to fund size; hurdle rate; no fee on undeployed capital', weight: 0 },
          { id: 'op_keyman', label: 'Key Man Risk', description: 'Single person driving thesis and execution with no identified backup', severity: 'H' } as any,
          { id: 'op_conflict', label: 'Conflict of Interest Review', guidance: 'GP side vehicles; related party transactions; fee sharing arrangements', weight: 0 },
        ]
      },
    },
    flags: [
      { id: 'op_thesis_vague', label: 'Thesis Unclear or Not Time-Bound', description: 'Lack of specific catalyst, exit trigger, or defined investment horizon.', severity: 'H' },
      { id: 'op_no_protection', label: 'Limited Downside Protection or Collateral', description: 'Asymmetric risk without structural protections or collateral coverage.', severity: 'H' },
      { id: 'op_generalist', label: 'Generalist Team Without Domain Expertise', description: 'Team lacks direct relevant experience in this specific opportunity type.', severity: 'M' },
      { id: 'op_sunk_cost', label: 'Evidence of Anchoring / Sunk Cost Behavior', description: 'GP unwilling to cut losses when thesis breaks; doubling down on losing positions.', severity: 'M' },
    ],
  },
})

// lib/extraction-validator.ts
// Shared cross-field validation, confidence tracking, and quote verification
// for AI-extracted fund data. Used by both upload routes.

export interface FieldConfidence {
  value: any
  confidence: 'H' | 'M' | 'L'
  source_quote?: string | null
  flag_reason?: string | null
}

export interface ValidationIssue {
  field: string
  issue: string
  severity: 'error' | 'warning'
}

// ── Quote Verification ────────────────────────────────────────────────────────
// Checks whether a source quote actually appears in the document text.
//
// The naive approach (match first 80 chars exactly) fails on table text because
// PDFs extract tables with collapsed whitespace, dropped punctuation, and broken
// column alignment — so "Fund Size: $2 billion target" might become
// "Fund Size $2 billion target" (colon dropped) or split across lines.
//
// Fix: try multiple short windows (25–50 chars) at multiple starting positions
// with aggressive normalization (strip punctuation, collapse spaces). Also try
// matching just the numeric/dollar value as a last resort.

export function verifySourceQuote(sourceQuote: string | null, docText: string): boolean {
  if (!sourceQuote || sourceQuote.length < 5) return false

  // Normalize: lowercase, collapse whitespace, strip most punctuation
  // but keep $, %, numbers, and letters since those carry the meaning.
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9$%.\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const normQuote = normalize(sourceQuote)
  const normDoc   = normalize(docText)

  // Try windows of increasing sizes at multiple starting positions.
  // Shorter windows are more forgiving of table extraction artifacts.
  const windowSizes = [25, 35, 50]
  const stepSize = 10

  for (const windowSize of windowSizes) {
    const maxStart = Math.max(0, normQuote.length - windowSize)
    for (let start = 0; start <= Math.min(maxStart, 120); start += stepSize) {
      const window = normQuote.substring(start, start + windowSize).trim()
      if (window.length >= 15 && normDoc.includes(window)) {
        return true
      }
    }
  }

  // Last resort: match just the key numeric/dollar value from the quote.
  // Catches cases where surrounding text is garbled but the number itself is present
  // (e.g. "$1.50%" in a fee schedule table).
  const numberMatches = normQuote.match(/\$[\d,.]+[bm]?|\d+\.?\d*%|\d+\.?\d*x/g)
  if (numberMatches) {
    for (const num of numberMatches) {
      if (num.length >= 3 && normDoc.includes(num)) {
        return true
      }
    }
  }

  return false
}

// ── Field Bounds ──────────────────────────────────────────────────────────────
// Sane bounds for fund-level financial figures. Anything outside these is either
// a unit error (raw dollars vs millions), a fund-vs-firm mixup, or a hallucination.

const FIELD_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  fund_size_mm:           { min: 0.1,   max: 100000, label: 'Fund size (raised/closed)' },  // large interval funds/BDCs/REITs can legitimately exceed $20B
  target_fund_size_mm:    { min: 0.1,   max: 100000, label: 'Target fund size' },
  committed_capital_mm:   { min: 0,     max: 20000,  label: 'Committed capital' },
  called_capital_mm:      { min: 0,     max: 20000,  label: 'Called capital' },
  deployed_capital_mm:    { min: 0,     max: 20000,  label: 'Deployed capital' },
  management_fee_pct:     { min: 0,     max: 0.10,   label: 'Management fee' },
  carry_pct:              { min: 0,     max: 0.50,   label: 'Carry' },
  gp_commitment_pct:      { min: 0,     max: 1,      label: 'GP commitment' },
  hurdle_rate:            { min: 0,     max: 0.30,   label: 'Hurdle rate' },
  target_irr:             { min: -0.50, max: 1.00,   label: 'Target IRR' },
  irr_net:                { min: -1.00, max: 2.00,   label: 'Net IRR (realized)' },
  irr_gross:              { min: -1.00, max: 2.00,   label: 'Gross IRR (realized)' },
  tvpi:                   { min: 0,     max: 20,     label: 'TVPI' },
  dpi:                    { min: 0,     max: 20,     label: 'DPI' },
  moic:                   { min: 0,     max: 20,     label: 'MOIC' },
  lock_up_months:         { min: 0,     max: 240,    label: 'Lock-up period' },
}

export function applyFieldBounds(facts: Record<string, any>): { facts: Record<string, any>; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const cleaned = { ...facts }

  for (const [field, bounds] of Object.entries(FIELD_BOUNDS)) {
    const val = cleaned[field]
    if (val == null) continue
    if (typeof val !== 'number' || isNaN(val)) {
      cleaned[field] = null
      issues.push({ field, issue: `${bounds.label} was not a valid number — cleared`, severity: 'warning' })
      continue
    }
    if (val < bounds.min || val > bounds.max) {
      cleaned[field] = null
      issues.push({
        field,
        issue: `${bounds.label} value of ${val} is outside realistic bounds (${bounds.min}–${bounds.max}) — likely a unit error or firm-vs-fund mixup. Cleared for manual review.`,
        severity: 'error',
      })
    }
  }

  return { facts: cleaned, issues }
}

export function applyCrossFieldChecks(facts: Record<string, any>): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // TVPI must be >= DPI (RVPI can't be negative)
  if (facts.tvpi != null && facts.dpi != null && facts.tvpi < facts.dpi) {
    issues.push({
      field: 'tvpi',
      issue: `TVPI (${facts.tvpi}x) is less than DPI (${facts.dpi}x), which is mathematically impossible (TVPI = DPI + RVPI). Re-verify both values.`,
      severity: 'error',
    })
  }

  // Called capital can't exceed committed capital
  if (facts.called_capital_mm != null && facts.committed_capital_mm != null && facts.called_capital_mm > facts.committed_capital_mm) {
    issues.push({
      field: 'called_capital_mm',
      issue: `Called capital ($${facts.called_capital_mm}M) exceeds committed capital ($${facts.committed_capital_mm}M). Re-verify.`,
      severity: 'error',
    })
  }

  // Net IRR should not exceed gross IRR
  if (facts.irr_net != null && facts.irr_gross != null && facts.irr_net > facts.irr_gross + 0.01) {
    issues.push({
      field: 'irr_net',
      issue: `Net IRR (${(facts.irr_net*100).toFixed(1)}%) exceeds Gross IRR (${(facts.irr_gross*100).toFixed(1)}%) — net should always be lower after fees. Re-verify.`,
      severity: 'warning',
    })
  }

  // GP commitment > 20% is suspicious
  if (facts.gp_commitment_pct != null && facts.gp_commitment_pct > 0.20) {
    issues.push({
      field: 'gp_commitment_pct',
      issue: `GP commitment of ${(facts.gp_commitment_pct*100).toFixed(1)}% is unusually high (typical range 1–5%). Possible decimal error — verify.`,
      severity: 'warning',
    })
  }

  // Deployed capital shouldn't exceed fund size (allow 5% buffer for rounding)
  if (facts.deployed_capital_mm != null && facts.fund_size_mm != null && facts.deployed_capital_mm > facts.fund_size_mm * 1.05) {
    issues.push({
      field: 'deployed_capital_mm',
      issue: `Deployed capital ($${facts.deployed_capital_mm}M) exceeds fund size ($${facts.fund_size_mm}M). May reference different fund series — verify.`,
      severity: 'warning',
    })
  }

  return issues
}

export function validateExtraction(rawFacts: Record<string, any>): { facts: Record<string, any>; issues: ValidationIssue[] } {
  const { facts: boundsChecked, issues: boundsIssues } = applyFieldBounds(rawFacts)
  const crossFieldIssues = applyCrossFieldChecks(boundsChecked)
  return { facts: boundsChecked, issues: [...boundsIssues, ...crossFieldIssues] }
}

export function formatIssuesForStorage(issues: ValidationIssue[]): string | null {
  if (!issues.length) return null
  return issues.map(i => `[${i.severity.toUpperCase()}] ${i.issue}`).join(' ')
}

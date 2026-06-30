// lib/extraction-validator.ts
// Shared cross-field validation and confidence tracking for AI-extracted fund data.
// Used by both /api/alt/upload and /api/alt/upload-to-fund to keep extraction
// trustworthy without requiring manual double-checking of every field.

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

// Sane bounds for fund-level financial figures. Anything outside these is either
// a unit error (raw dollars vs millions), a fund-vs-firm mixup, or a hallucination.
const FIELD_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  fund_size_mm:        { min: 0.1,  max: 20000, label: 'Fund size' },
  committed_capital_mm:{ min: 0,    max: 20000, label: 'Committed capital' },
  called_capital_mm:   { min: 0,    max: 20000, label: 'Called capital' },
  management_fee_pct:  { min: 0,    max: 0.10,  label: 'Management fee' },   // 10% cap — anything higher is almost certainly a decimal error
  carry_pct:           { min: 0,    max: 0.50,  label: 'Carry' },            // 50% cap
  gp_commitment_pct:   { min: 0,    max: 1,     label: 'GP commitment' },
  hurdle_rate:         { min: 0,    max: 0.30,  label: 'Hurdle rate' },
  target_irr:          { min: -0.50,max: 1.00,  label: 'Target IRR' },
  irr_net:             { min: -1.00,max: 2.00,  label: 'Net IRR' },
  irr_gross:           { min: -1.00,max: 2.00,  label: 'Gross IRR' },
  tvpi:                { min: 0,    max: 20,    label: 'TVPI' },
  dpi:                 { min: 0,    max: 20,    label: 'DPI' },
  moic:                { min: 0,    max: 20,    label: 'MOIC' },
  lock_up_months:      { min: 0,    max: 240,   label: 'Lock-up period' },
}

/**
 * Runs hard numeric bounds checks on every recognized field. Any value outside
 * realistic bounds is nulled and flagged — this catches unit errors (raw $ vs
 * millions), misplaced decimals on percentages, and firm-vs-fund mixups.
 */
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

/**
 * Cross-field logical checks — relationships between fields that must hold true
 * for the data to be internally consistent. Catches extraction errors that pass
 * individual bounds checks but are still wrong relative to each other.
 */
export function applyCrossFieldChecks(facts: Record<string, any>): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // TVPI = DPI + RVPI, so TVPI must be >= DPI (RVPI can't be negative)
  if (facts.tvpi != null && facts.dpi != null && facts.tvpi < facts.dpi) {
    issues.push({
      field: 'tvpi',
      issue: `TVPI (${facts.tvpi}x) is less than DPI (${facts.dpi}x), which is mathematically impossible (TVPI = DPI + RVPI). Re-verify both values against the source document.`,
      severity: 'error',
    })
  }

  // Called capital can't exceed committed capital
  if (facts.called_capital_mm != null && facts.committed_capital_mm != null && facts.called_capital_mm > facts.committed_capital_mm) {
    issues.push({
      field: 'called_capital_mm',
      issue: `Called capital ($${facts.called_capital_mm}M) exceeds committed capital ($${facts.committed_capital_mm}M), which shouldn't happen. Re-verify against source.`,
      severity: 'error',
    })
  }

  // Net IRR should not exceed gross IRR (fees only reduce returns)
  if (facts.irr_net != null && facts.irr_gross != null && facts.irr_net > facts.irr_gross + 0.01) {
    issues.push({
      field: 'irr_net',
      issue: `Net IRR (${(facts.irr_net*100).toFixed(1)}%) exceeds Gross IRR (${(facts.irr_gross*100).toFixed(1)}%) — net should always be lower than gross after fees. Re-verify.`,
      severity: 'warning',
    })
  }

  // GP commitment of exactly 100% is suspicious (usually 1-5% range, rarely higher)
  if (facts.gp_commitment_pct != null && facts.gp_commitment_pct > 0.20) {
    issues.push({
      field: 'gp_commitment_pct',
      issue: `GP commitment of ${(facts.gp_commitment_pct*100).toFixed(1)}% is unusually high (typical range is 1-5%). Possible decimal or field confusion — verify.`,
      severity: 'warning',
    })
  }

  return issues
}

/**
 * Runs the full validation pipeline: bounds checks + cross-field checks.
 * Returns cleaned facts plus a consolidated list of issues for the
 * deployment_pace_concern / flag fields so they surface in the UI.
 */
export function validateExtraction(rawFacts: Record<string, any>): { facts: Record<string, any>; issues: ValidationIssue[] } {
  const { facts: boundsChecked, issues: boundsIssues } = applyFieldBounds(rawFacts)
  const crossFieldIssues = applyCrossFieldChecks(boundsChecked)
  return { facts: boundsChecked, issues: [...boundsIssues, ...crossFieldIssues] }
}

/**
 * Formats validation issues into a human-readable string for storage in
 * deployment_pace_concern or a dedicated extraction_warnings field.
 */
export function formatIssuesForStorage(issues: ValidationIssue[]): string | null {
  if (!issues.length) return null
  return issues.map(i => `[${i.severity.toUpperCase()}] ${i.issue}`).join(' ')
}

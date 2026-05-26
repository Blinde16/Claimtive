// Post-generation verifier for the AI layer.
//
// The AI is only allowed to *describe* the deterministic analysis — it must not
// invent numbers. This module scans the AI's free-text output for any numeric
// or named claim (dollars, percentages, payer names, CARC codes) and confirms
// every one of them can be derived from the source payload. Any unsupported
// claim is treated as a hallucination: the caller rejects the AI output and
// falls back to the deterministic rule-based insights.
//
// Pure logic. No I/O.

import type { AiInsightPayload } from "./deidentify";

export interface VerificationViolation {
  kind: "currency" | "percent" | "payer" | "carc";
  value: string; // the literal token from the AI output
  reason: string;
}

export interface VerificationResult {
  ok: boolean;
  violations: VerificationViolation[];
}

// Currency tolerance: round-off + minor wording variance.
const CURRENCY_TOLERANCE_DOLLARS = 1;
// Percent tolerance: 0.5 percentage points (e.g. 49.7% ≈ 50%).
const PERCENT_TOLERANCE_PCT = 0.5;

/** Parse "$1,234.56" / "$1234" / "1,234.56" → 1234.56. Returns null if not numeric. */
function parseCurrencyToken(token: string): number | null {
  const cleaned = token.replace(/[\s$,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Extract currency-looking tokens (with leading `$`) from arbitrary text. */
export function extractCurrencies(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?-?\d[\d,]*(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) {
    const n = parseCurrencyToken(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Extract percent-looking tokens (e.g. "50%", "12.5%"). Returns the % value (50, 12.5). */
export function extractPercents(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?\s*%/g;
  for (const m of text.matchAll(re)) {
    const n = Number(m[0].replace(/[\s%]/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Collect every dollar amount that appears in the source payload. */
export function sourceCurrencies(source: AiInsightPayload): number[] {
  const m = source.metrics;
  const vals = [
    m.totalBilled,
    m.totalPaid,
    m.totalDenied,
    m.totalUnderpaid,
    m.recoverable
  ];
  for (const c of source.categories) vals.push(c.amount);
  for (const r of source.reasons) vals.push(r.amount);
  for (const p of source.payers) {
    vals.push(p.billed, p.paid, p.denied, p.underpaid);
    // Derived "leakage" total per payer (the rule-based insights surface this).
    vals.push(round2(p.denied + p.underpaid));
  }
  return vals;
}

/** Collect every percent (in % units) that appears in (or is derivable from) the source. */
export function sourcePercents(source: AiInsightPayload): number[] {
  const m = source.metrics;
  const pcts: number[] = [m.denialRate * 100, m.netCollectionRate * 100];
  for (const p of source.payers) pcts.push(p.denialRate * 100);
  // Category share of total denied — a common rule-based phrasing
  // ("Authorization is 35% of denial dollars").
  if (m.totalDenied > 0) {
    for (const c of source.categories) pcts.push((c.amount / m.totalDenied) * 100);
  }
  return pcts;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function within(value: number, candidates: number[], tolerance: number): boolean {
  return candidates.some((c) => Math.abs(value - c) <= tolerance);
}

/**
 * Verify the AI's free-text output against the source aggregates. The caller
 * passes the array of insight strings the AI produced (titles + details work)
 * and the AiInsightPayload that was sent to the AI.
 */
export function verifyInsightOutput(
  texts: string[],
  source: AiInsightPayload
): VerificationResult {
  const allowedCurrencies = sourceCurrencies(source);
  const allowedPercents = sourcePercents(source);
  const allowedPayers = new Set(
    source.payers.map((p) => p.payerName.toUpperCase())
  );
  const allowedCarcs = new Set(source.reasons.map((r) => r.reasonCode));

  const violations: VerificationViolation[] = [];

  for (const text of texts) {
    // Currency
    for (const m of text.matchAll(/\$\s?-?\d[\d,]*(?:\.\d+)?/g)) {
      const n = parseCurrencyToken(m[0]);
      if (n === null) continue;
      if (!within(n, allowedCurrencies, CURRENCY_TOLERANCE_DOLLARS)) {
        violations.push({
          kind: "currency",
          value: m[0],
          reason: `not within ${CURRENCY_TOLERANCE_DOLLARS} of any source amount`
        });
      }
    }
    // Percent
    for (const m of text.matchAll(/-?\d+(?:\.\d+)?\s*%/g)) {
      const n = Number(m[0].replace(/[\s%]/g, ""));
      if (!Number.isFinite(n)) continue;
      if (!within(n, allowedPercents, PERCENT_TOLERANCE_PCT)) {
        violations.push({
          kind: "percent",
          value: m[0],
          reason: `not within ${PERCENT_TOLERANCE_PCT}pp of any source ratio`
        });
      }
    }
    // CARC codes (CARC <num> or "code <num>")
    for (const m of text.matchAll(/\bCARC\s*-?\s*(\d{1,3})\b/gi)) {
      if (!allowedCarcs.has(m[1])) {
        violations.push({
          kind: "carc",
          value: m[0],
          reason: "code not present in source.reasons"
        });
      }
    }
    // Payer names: any ALL-CAPS multi-letter token that isn't a known payer is suspect.
    // We're conservative: only flag tokens that the AI explicitly framed as a payer name.
    // Look for phrases like "[NAME] denied", "[NAME] underpaid", "payer [NAME]".
    for (const m of text.matchAll(
      /\b(?:payer\s+)?([A-Z][A-Z &/]{2,})\b(?=\s+(?:accounts|denied|underpaid|paid|claim))/g
    )) {
      const candidate = m[1].trim().toUpperCase();
      // Allow generic words that aren't payers per se.
      if (["WE", "THE", "ALL", "ANY", "OUR"].includes(candidate)) continue;
      if (!allowedPayers.has(candidate)) {
        violations.push({
          kind: "payer",
          value: m[1],
          reason: "payer name not present in source.payers"
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

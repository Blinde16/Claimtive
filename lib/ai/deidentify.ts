// De-identification gateway for the AI layer.
//
// Design principle: the AI never sees PHI. Period.
//
// All AI prompts must be built from the output of buildInsightPayload(). It's
// a deliberate WHITELIST — only the aggregate fields below are allowed through;
// anything resembling individual patient identifiers is excluded by construction
// (we don't even read those fields) and a final scan rejects payloads that look
// like they slipped one in.
//
// This module is pure logic — no DB, no network — so it's fully unit-testable
// and serves as the deterministic safety net under the AI layer.

import type {
  CategoryRow,
  DashboardMetrics,
  DenialReasonRow,
  PayerRow
} from "../analytics/metrics";

/**
 * The exact shape that is safe to send to an LLM. By construction, no patient
 * identifiers, names, dates of service, NPIs, or claim control numbers.
 *
 * Payer names are intentionally included — they are corporate entities (Aetna,
 * BCBS, etc.), not PHI under HIPAA Safe Harbor.
 */
export interface AiInsightPayload {
  metrics: {
    claimCount: number;
    deniedClaimCount: number;
    underpaidClaimCount: number;
    totalBilled: number;
    totalPaid: number;
    totalDenied: number;
    totalUnderpaid: number;
    recoverable: number;
    netCollectionRate: number;
    denialRate: number;
  };
  categories: Array<{ category: string; amount: number; count: number }>;
  reasons: Array<{
    groupCode: string;
    reasonCode: string;
    description: string;
    category: string;
    amount: number;
    count: number;
  }>;
  payers: Array<{
    payerName: string;
    claimCount: number;
    billed: number;
    paid: number;
    denied: number;
    underpaid: number;
    denialRate: number;
  }>;
}

/**
 * Heuristic last-line-of-defense scan. We never expect these patterns to appear
 * in an AiInsightPayload (we build it from aggregates only), so if one does,
 * something has gone wrong upstream — fail loud rather than ship PHI to the LLM.
 */
const PHI_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // U.S. SSN (xxx-xx-xxxx)
  { re: /\b\d{3}-\d{2}-\d{4}\b/, label: "SSN-like" },
  // NPI is 10 digits — naive but useful as a tripwire on string values
  { re: /\b\d{10}\b/, label: "NPI-like 10-digit" },
  // ISO date-of-service (YYYY-MM-DD) — Safe Harbor disallows dates more specific than year
  { re: /\b(19|20|21)\d{2}-\d{2}-\d{2}\b/, label: "specific date" }
];

/**
 * Build the only AI-safe view of the analytics. Inputs are the aggregate types
 * that lib/analytics/metrics.ts already produces (no PHI in them) — but we
 * defensively re-pick fields and scan for PHI patterns before returning.
 */
export function buildInsightPayload(input: {
  metrics: DashboardMetrics;
  categories: CategoryRow[];
  reasons: DenialReasonRow[];
  payers: PayerRow[];
}): AiInsightPayload {
  const { metrics, categories, reasons, payers } = input;

  const payload: AiInsightPayload = {
    metrics: {
      claimCount: metrics.claimCount,
      deniedClaimCount: metrics.deniedClaimCount,
      underpaidClaimCount: metrics.underpaidClaimCount,
      totalBilled: metrics.totalBilled,
      totalPaid: metrics.totalPaid,
      totalDenied: metrics.totalDenied,
      totalUnderpaid: metrics.totalUnderpaid,
      recoverable: metrics.recoverable,
      netCollectionRate: metrics.netCollectionRate,
      denialRate: metrics.denialRate
    },
    categories: categories.map((c) => ({
      category: c.category,
      amount: c.amount,
      count: c.count
    })),
    reasons: reasons.map((r) => ({
      groupCode: r.groupCode,
      reasonCode: r.reasonCode,
      description: r.description,
      category: r.category,
      amount: r.amount,
      count: r.count
    })),
    payers: payers.map((p) => ({
      payerName: p.payerName,
      claimCount: p.claimCount,
      billed: p.billed,
      paid: p.paid,
      denied: p.denied,
      underpaid: p.underpaid,
      denialRate: p.denialRate
    }))
  };

  assertNoPhi(payload);
  return payload;
}

/**
 * Scan all string values in a payload for PHI-looking patterns. Throws if any
 * tripwire fires — this is a backstop, not a normal validation path.
 */
export function assertNoPhi(payload: unknown): void {
  for (const [path, value] of walkStrings(payload)) {
    for (const { re, label } of PHI_PATTERNS) {
      if (re.test(value)) {
        throw new Error(
          `[ai/deidentify] refusing to send: value at ${path} matches PHI pattern (${label})`
        );
      }
    }
  }
}

function* walkStrings(
  v: unknown,
  path: string = "$"
): Generator<[string, string]> {
  if (typeof v === "string") {
    yield [path, v];
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) yield* walkStrings(v[i], `${path}[${i}]`);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      yield* walkStrings(val, `${path}.${k}`);
    }
  }
}

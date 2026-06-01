// Denial prevention v1 — "learn from your own history."
//
// Predictive denial scoring needs volume + time; this is the honest, deterministic
// first rung: for each submitted (837) claim that hasn't been adjudicated yet, look
// up how often the SAME payer historically denied the SAME procedure code (from the
// org's own 835 remittances) and flag the risky ones BEFORE they adjudicate — with
// the learned reason and a concrete pre-empt. Fully explainable; no black box. It
// gets sharper as more remittances accumulate (the data flywheel).

import { prisma } from "../db";
import { CARC_CODES, DenialCategory } from "./carc";

const MIN_SAMPLE = 2; // need at least this many past claims to trust a pattern
const ELEVATED = 0.4; // >=40% historical denial rate → elevated
const HIGH = 0.7; // >=70% → high

export interface HistoricalDenialStat {
  total: number;
  denied: number;
  rate: number;
  dominantReason?: string;
  dominantCategory?: DenialCategory;
}

export interface RiskFlag {
  procedureCode: string;
  modifier: string | null;
  deniedCount: number;
  totalCount: number;
  rate: number;
  level: "high" | "elevated";
  reason?: string;
  category?: DenialCategory;
  action: string;
}

export interface RiskClaim {
  id: string;
  patientControlNumber: string | null;
  payerName: string | null;
  level: "high" | "elevated";
  flags: RiskFlag[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
const statKey = (payer: string | null | undefined, code: string) =>
  `${norm(payer)}||${norm(code)}`;

/** Concrete pre-empt for the biller, keyed off the historical denial category. */
export function suggestedAction(category?: DenialCategory): string {
  switch (category) {
    case "Authorization":
      return "Confirm prior authorization is on file before this adjudicates.";
    case "Timely Filing":
      return "Submit now — this payer enforces the filing deadline on this code.";
    case "Medical Necessity":
      return "Attach clinical documentation / medical-necessity support.";
    case "Duplicate":
      return "Check whether this was already submitted before sending.";
    case "Eligibility":
      return "Re-verify the patient's eligibility and plan coverage.";
    case "Coding":
    case "Missing Information":
      return "Double-check codes, modifiers, and required fields.";
    case "Coordination of Benefits":
      return "Confirm primary vs. secondary payer order before submission.";
    default:
      return "Review against the historical denial before submission.";
  }
}

interface HistoricalLine {
  payerName: string | null;
  procedureCode: string;
  isDenied: boolean;
  denialCode?: string | null;
  denialReason?: string | null;
}

/**
 * Pure: build per-(payer, procedure) denial statistics from historical 835 service
 * lines, tracking the most common denial reason/category among the denied ones.
 */
export function buildDenialStats(
  lines: HistoricalLine[]
): Map<string, HistoricalDenialStat> {
  interface Acc {
    total: number;
    denied: number;
    reasons: Map<string, { count: number; reason?: string; category?: DenialCategory }>;
  }
  const acc = new Map<string, Acc>();

  for (const l of lines) {
    const k = statKey(l.payerName, l.procedureCode);
    let a = acc.get(k);
    if (!a) {
      a = { total: 0, denied: 0, reasons: new Map() };
      acc.set(k, a);
    }
    a.total += 1;
    if (l.isDenied) {
      a.denied += 1;
      const code = l.denialCode ?? "?";
      const entry = a.reasons.get(code) ?? {
        count: 0,
        reason: l.denialReason ?? (l.denialCode ? CARC_CODES[l.denialCode]?.description : undefined),
        category: l.denialCode ? CARC_CODES[l.denialCode]?.category : undefined
      };
      entry.count += 1;
      a.reasons.set(code, entry);
    }
  }

  const out = new Map<string, HistoricalDenialStat>();
  for (const [k, a] of acc) {
    let dominant: { count: number; reason?: string; category?: DenialCategory } | undefined;
    for (const r of a.reasons.values()) {
      if (!dominant || r.count > dominant.count) dominant = r;
    }
    out.set(k, {
      total: a.total,
      denied: a.denied,
      rate: a.total > 0 ? a.denied / a.total : 0,
      dominantReason: dominant?.reason,
      dominantCategory: dominant?.category
    });
  }
  return out;
}

/**
 * Pure: assess a submitted claim's service lines against the historical stats,
 * returning a risk flag per line that clears the threshold.
 */
export function assessClaim(
  payerName: string | null,
  lines: Array<{ procedureCode: string; modifier?: string | null }>,
  stats: Map<string, HistoricalDenialStat>
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const line of lines) {
    const s = stats.get(statKey(payerName, line.procedureCode));
    if (!s || s.total < MIN_SAMPLE || s.denied < 1 || s.rate < ELEVATED) continue;
    flags.push({
      procedureCode: norm(line.procedureCode),
      modifier: line.modifier ? norm(line.modifier) : null,
      deniedCount: s.denied,
      totalCount: s.total,
      rate: s.rate,
      level: s.rate >= HIGH ? "high" : "elevated",
      reason: s.dominantReason,
      category: s.dominantCategory,
      action: suggestedAction(s.dominantCategory)
    });
  }
  return flags;
}

/**
 * Load the org's 835 history + un-adjudicated 837 claims and return the submitted
 * claims at elevated/high denial risk, worst first.
 */
export async function getDenialRiskClaims(
  organizationId: string
): Promise<RiskClaim[]> {
  const [historical, submitted] = await Promise.all([
    prisma.serviceLine.findMany({
      where: { claim: { organizationId, ediFile: { type: "X835" } } },
      select: {
        procedureCode: true,
        isDenied: true,
        denialCode: true,
        denialReason: true,
        claim: { select: { payerName: true } }
      }
    }),
    prisma.claim.findMany({
      where: { organizationId, ediFile: { type: "X837" } },
      select: {
        id: true,
        patientControlNumber: true,
        payerName: true,
        serviceLines: { select: { procedureCode: true, modifier: true } }
      }
    })
  ]);

  const stats = buildDenialStats(
    historical.map((l) => ({
      payerName: l.claim.payerName,
      procedureCode: l.procedureCode,
      isDenied: l.isDenied,
      denialCode: l.denialCode,
      denialReason: l.denialReason
    }))
  );

  const risky: RiskClaim[] = [];
  for (const c of submitted) {
    const flags = assessClaim(c.payerName, c.serviceLines, stats);
    if (flags.length === 0) continue;
    risky.push({
      id: c.id,
      patientControlNumber: c.patientControlNumber,
      payerName: c.payerName,
      level: flags.some((f) => f.level === "high") ? "high" : "elevated",
      flags
    });
  }

  // Highest risk first: high before elevated, then by worst line rate.
  risky.sort((a, b) => {
    if (a.level !== b.level) return a.level === "high" ? -1 : 1;
    return Math.max(...b.flags.map((f) => f.rate)) - Math.max(...a.flags.map((f) => f.rate));
  });
  return risky;
}

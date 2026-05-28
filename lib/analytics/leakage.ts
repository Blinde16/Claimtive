// Additional revenue-leakage detectors that sit alongside denial/underpayment
// analysis. Both work off already-ingested 835 data — no new parsing.
//
//  1. Patient-responsibility surfacing — money the payer assigned to the patient
//     (deductible / coinsurance / copay). This is NON-actionable against the
//     payer (you can't appeal it) but it IS collectible revenue: balances the
//     clinic must bill to the patient. It is *separate* from denied dollars.
//
//  2. Coordination-of-benefits (COB) follow-up — claims where the primary payer
//     signaled another payer is responsible (CARC 22 / 109 / 19). The biller
//     should verify the secondary was billed. NOTE: these CARC codes classify as
//     "Coordination of Benefits" which is already *actionable*, so these dollars
//     are ALREADY included in the denied/actionable total — this view simply
//     isolates the COB subset so it can be worked correctly. It is NOT additive.

import { prisma } from "../db";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Restrict to remittance (835) claims, where adjudication is known.
const remit835 = (organizationId: string) => ({
  organizationId,
  ediFile: { type: "X835" as const }
});

// ── Patient responsibility ──────────────────────────────────────────────────

/** Human label for a PR-group CARC reason code. */
export function patientResponsibilityLabel(reasonCode: string): string {
  switch (reasonCode) {
    case "1":
      return "Deductible";
    case "2":
      return "Coinsurance";
    case "3":
      return "Copay";
    default:
      return "Other patient responsibility";
  }
}

export interface PrTypeRow {
  label: string;
  amount: number;
  count: number;
}

/**
 * Pure: collapse PR-group adjustment rows (grouped by reason code) into labeled
 * buckets, merging everything that isn't deductible/coinsurance/copay into a
 * single "Other" line. Sorted by amount descending.
 */
export function summarizePrTypes(
  rows: Array<{ reasonCode: string; amount: number; count: number }>
): PrTypeRow[] {
  const map = new Map<string, PrTypeRow>();
  for (const r of rows) {
    const label = patientResponsibilityLabel(r.reasonCode);
    const existing = map.get(label);
    if (existing) {
      existing.amount = round2(existing.amount + r.amount);
      existing.count += r.count;
    } else {
      map.set(label, { label, amount: round2(r.amount), count: r.count });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface PatientResponsibilitySummary {
  /** Sum of CLP05 patient-responsibility across remittance claims. */
  total: number;
  /** Claims carrying any patient responsibility. */
  claimCount: number;
  /** "Of which" breakdown from PR-group adjustments (deductible/coinsurance/copay). */
  byType: PrTypeRow[];
}

export async function getPatientResponsibilitySummary(
  organizationId: string
): Promise<PatientResponsibilitySummary> {
  const where = remit835(organizationId);
  const [agg, claimCount, prAdjustments] = await Promise.all([
    prisma.claim.aggregate({
      where: { ...where, patientResponsibility: { gt: 0 } },
      _sum: { patientResponsibility: true }
    }),
    prisma.claim.count({
      where: { ...where, patientResponsibility: { gt: 0 } }
    }),
    prisma.adjustment.groupBy({
      by: ["reasonCode"],
      where: {
        groupCode: "PR",
        OR: [{ claim: where }, { serviceLine: { claim: where } }]
      },
      _sum: { amount: true },
      _count: { _all: true }
    })
  ]);

  const byType = summarizePrTypes(
    prAdjustments.map((g) => ({
      reasonCode: g.reasonCode,
      amount: Number(g._sum.amount ?? 0),
      count: g._count._all
    }))
  );

  return {
    total: round2(Number(agg._sum.patientResponsibility ?? 0)),
    claimCount,
    byType
  };
}

// ── Coordination of benefits ──────────────────────────────────────────────────

// CARC codes where the payer signals another payer/party is responsible.
//  22  — may be covered by another payer per coordination of benefits
//  109 — claim/service not covered by this payer/contractor (send elsewhere)
//  19  — work-related injury; liability of Workers' Compensation
export const COB_REASON_CODES = ["22", "109", "19"] as const;

interface CobAdjustmentRow {
  amount: number;
  claimId: string | null;
  serviceLine: { claimId: string } | null;
}

/**
 * Pure: total the COB-coded adjustment dollars per claim. Adjustments may be
 * attached at claim level or service level — resolve both to a claim id.
 */
export function aggregateCobByClaim(
  adjustments: CobAdjustmentRow[]
): { byClaim: Map<string, number>; total: number } {
  const byClaim = new Map<string, number>();
  let total = 0;
  for (const a of adjustments) {
    const claimId = a.claimId ?? a.serviceLine?.claimId ?? null;
    if (!claimId) continue;
    const amt = Number(a.amount);
    byClaim.set(claimId, round2((byClaim.get(claimId) ?? 0) + amt));
    total = round2(total + amt);
  }
  return { byClaim, total };
}

export interface CobFollowUp {
  id: string;
  patientControlNumber: string | null;
  payerName: string | null;
  totalCharge: number;
  totalPaid: number;
  /** COB-attributed dollars the primary assigned to another payer. */
  cobAmount: number;
}

export interface CobSummary {
  count: number;
  /** Sum of COB-attributed dollars. Already counted within actionable denials. */
  amountToCoordinate: number;
  claims: CobFollowUp[];
}

export async function getCobFollowUps(
  organizationId: string,
  limit = 10
): Promise<CobSummary> {
  const where = remit835(organizationId);
  const adjustments = await prisma.adjustment.findMany({
    where: {
      reasonCode: { in: [...COB_REASON_CODES] },
      OR: [{ claim: where }, { serviceLine: { claim: where } }]
    },
    select: {
      amount: true,
      claimId: true,
      serviceLine: { select: { claimId: true } }
    }
  });

  const { byClaim, total } = aggregateCobByClaim(
    adjustments.map((a) => ({
      amount: Number(a.amount),
      claimId: a.claimId,
      serviceLine: a.serviceLine
    }))
  );
  if (byClaim.size === 0) {
    return { count: 0, amountToCoordinate: 0, claims: [] };
  }

  const claims = await prisma.claim.findMany({
    where: { id: { in: [...byClaim.keys()] } },
    select: {
      id: true,
      patientControlNumber: true,
      payerName: true,
      totalCharge: true,
      totalPaid: true
    }
  });

  const rows: CobFollowUp[] = claims
    .map((c) => ({
      id: c.id,
      patientControlNumber: c.patientControlNumber,
      payerName: c.payerName,
      totalCharge: Number(c.totalCharge),
      totalPaid: Number(c.totalPaid),
      cobAmount: byClaim.get(c.id) ?? 0
    }))
    .sort((a, b) => b.cobAmount - a.cobAmount);

  return {
    count: rows.length,
    amountToCoordinate: total,
    claims: rows.slice(0, limit)
  };
}

// 837 <-> 835 reconciliation: find claims that were SUBMITTED (837) but have no
// REMITTANCE (835) — i.e., the payer never adjudicated them. These are often the
// biggest bucket of invisible money (claims lost in transit, heading toward
// timely-filing death) because nothing in a remittance ever flags them.
//
// Matching key is the patient control number (CLP01 / the provider's claim ID),
// which appears on both the 837 and the 835.

import { prisma } from "../db";

export interface SubmittedClaimLite {
  id: string;
  patientControlNumber: string | null;
  payerName: string | null;
  serviceDate: Date | null;
  createdAt: Date;
  totalCharge: number;
}

export interface UnadjudicatedClaim {
  id: string;
  patientControlNumber: string | null;
  payerName: string | null;
  ageDays: number | null;
  totalCharge: number;
}

export interface UnadjudicatedSummary {
  count: number;
  billedAtRisk: number;
  claims: UnadjudicatedClaim[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pure core: given submitted (837) claims and the set of control numbers that
 * DO have a remittance, return the unadjudicated ones. A claim is flagged when
 * it has no matching remittance AND it's either older than `agingDays` (by
 * service date) or has no service date to verify timeliness (worth a look).
 * Freshly-submitted claims still within the window are not flagged.
 */
export function findUnadjudicated(
  submitted: SubmittedClaimLite[],
  remittedControlNumbers: Set<string>,
  opts: { now: Date; agingDays: number }
): UnadjudicatedClaim[] {
  const out: UnadjudicatedClaim[] = [];
  for (const c of submitted) {
    const hasRemit =
      c.patientControlNumber !== null &&
      remittedControlNumbers.has(c.patientControlNumber);
    if (hasRemit) continue;

    const ageDays = c.serviceDate
      ? Math.floor((opts.now.getTime() - c.serviceDate.getTime()) / 86_400_000)
      : null;

    // Skip claims still within the adjudication window (not yet "lost").
    if (ageDays !== null && ageDays < opts.agingDays) continue;

    out.push({
      id: c.id,
      patientControlNumber: c.patientControlNumber,
      payerName: c.payerName,
      ageDays,
      totalCharge: c.totalCharge
    });
  }
  return out.sort((a, b) => b.totalCharge - a.totalCharge);
}

/** Org-scoped query wrapper around findUnadjudicated. */
export async function getUnadjudicatedClaims(
  organizationId: string,
  agingDays = 30
): Promise<UnadjudicatedSummary> {
  const [remits, submitted] = await Promise.all([
    prisma.claim.findMany({
      where: { organizationId, ediFile: { type: "X835" } },
      select: { patientControlNumber: true }
    }),
    prisma.claim.findMany({
      where: { organizationId, ediFile: { type: "X837" } },
      select: {
        id: true,
        patientControlNumber: true,
        payerName: true,
        serviceDate: true,
        createdAt: true,
        totalCharge: true
      }
    })
  ]);

  const remittedControlNumbers = new Set<string>();
  for (const r of remits) {
    if (r.patientControlNumber) remittedControlNumbers.add(r.patientControlNumber);
  }

  const claims = findUnadjudicated(
    submitted.map((s) => ({ ...s, totalCharge: Number(s.totalCharge) })),
    remittedControlNumbers,
    { now: new Date(), agingDays }
  );

  return {
    count: claims.length,
    billedAtRisk: round2(claims.reduce((sum, c) => sum + c.totalCharge, 0)),
    claims
  };
}

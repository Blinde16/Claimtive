// Recompute stored claim analytics for an organization.
//
// Denial/underpayment numbers are written once at ingest time using the contract
// rates that existed then. Clinics typically upload remittances BEFORE loading
// their fee schedules, so those early claims show $0 underpaid forever. This
// re-runs the deterministic engine over already-ingested 835 claims with the
// CURRENT rate table and rewrites the derived fields — so loading (or fixing)
// contracts retroactively corrects the dashboard.
//
// NOTE: runs synchronously over an org's claims. Fine at pilot scale; for large
// tenants this should move to a background job (tracked).

import { prisma } from "../db";
import { buildRateLookup } from "../ingest";
import { analyzeClaim } from "./denials";
import { ParsedAdjustment, ParsedClaim } from "../edi/types";

function toParsedAdjustments(
  rows: Array<{
    level: string;
    groupCode: string;
    reasonCode: string;
    amount: unknown;
    quantity: unknown;
  }>
): ParsedAdjustment[] {
  return rows.map((a) => ({
    level: a.level === "SERVICE" ? "SERVICE" : "CLAIM",
    groupCode: a.groupCode,
    reasonCode: a.reasonCode,
    amount: Number(a.amount),
    quantity: a.quantity == null ? undefined : Number(a.quantity)
  }));
}

export interface RecomputeResult {
  claimsUpdated: number;
}

/**
 * Recompute and persist denial/underpayment analytics for every 835 claim in an
 * org, using the org's current contract rates. Also refreshes the EdiFile
 * rollup totals so the dashboard/uploads numbers stay consistent.
 */
export async function recomputeOrgAnalytics(
  organizationId: string
): Promise<RecomputeResult> {
  const rateLookup = await buildRateLookup(organizationId);

  const claims = await prisma.claim.findMany({
    where: { organizationId, ediFile: { type: "X835" } },
    include: {
      adjustments: true,
      serviceLines: { include: { adjustments: true }, orderBy: { createdAt: "asc" } }
    }
  });

  let claimsUpdated = 0;

  // Process in small chunks so we never hold a giant transaction or flood the
  // (small) connection pool.
  const CHUNK = 25;
  for (let i = 0; i < claims.length; i += CHUNK) {
    const slice = claims.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (c) => {
        const parsed: ParsedClaim = {
          patientControlNumber: c.patientControlNumber ?? undefined,
          payerClaimControlNumber: c.payerClaimControlNumber ?? undefined,
          statusCode: c.statusCode ?? undefined,
          filingIndicator: c.filingIndicator ?? undefined,
          renderingProviderNpi: c.renderingProviderNpi ?? undefined,
          patientName: c.patientName ?? undefined,
          serviceDate: undefined,
          totalCharge: Number(c.totalCharge),
          totalPaid: Number(c.totalPaid),
          patientResponsibility: Number(c.patientResponsibility),
          adjustments: toParsedAdjustments(c.adjustments),
          serviceLines: c.serviceLines.map((l) => ({
            procedureCode: l.procedureCode,
            modifier: l.modifier ?? undefined,
            revenueCode: l.revenueCode ?? undefined,
            units: Number(l.units),
            serviceDate: undefined,
            chargeAmount: Number(l.chargeAmount),
            paidAmount: Number(l.paidAmount),
            adjustments: toParsedAdjustments(l.adjustments),
            remarkCodes: l.remarkCodes
          }))
        };

        const analysis = analyzeClaim(parsed, rateLookup, c.payerId);

        await prisma.$transaction([
          prisma.claim.update({
            where: { id: c.id },
            data: {
              deniedAmount: analysis.deniedAmount,
              underpaidAmount: analysis.underpaidAmount,
              isDenied: analysis.isDenied,
              isUnderpaid: analysis.isUnderpaid,
              primaryDenialCode: analysis.primaryDenialCode ?? null,
              primaryDenialReason: analysis.primaryDenialReason ?? null,
              statusLabel: analysis.statusLabel ?? c.statusLabel
            }
          }),
          ...c.serviceLines.map((l, idx) => {
            const s = analysis.services[idx];
            return prisma.serviceLine.update({
              where: { id: l.id },
              data: {
                allowedAmount: s.allowedAmount,
                contractedRate: s.contractedRate ?? null,
                underpaidAmount: s.underpaidAmount,
                deniedAmount: s.deniedAmount,
                isDenied: s.isDenied,
                isUnderpaid: s.isUnderpaid,
                denialCode: s.denialCode ?? null,
                denialReason: s.denialReason ?? null
              }
            });
          })
        ]);
        claimsUpdated++;
      })
    );
  }

  // Refresh per-file rollups so Uploads/dashboard file totals match the claims.
  const files = await prisma.ediFile.findMany({
    where: { organizationId, type: "X835" },
    select: { id: true }
  });
  await Promise.all(
    files.map(async (f) => {
      const agg = await prisma.claim.aggregate({
        where: { ediFileId: f.id },
        _sum: { deniedAmount: true, underpaidAmount: true }
      });
      await prisma.ediFile.update({
        where: { id: f.id },
        data: {
          totalDenied: agg._sum.deniedAmount ?? 0,
          totalUnderpaid: agg._sum.underpaidAmount ?? 0
        }
      });
    })
  );

  return { claimsUpdated };
}

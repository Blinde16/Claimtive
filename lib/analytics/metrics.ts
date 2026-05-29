import { prisma } from "../db";
import { classifyAdjustment, DenialCategory } from "./carc";

// Denial/underpayment metrics are derived from remittance (835) claims, where
// the payer's adjudication outcome is known.
const remitWhere = (organizationId: string) => ({
  organizationId,
  ediFile: { type: "X835" as const }
});

export interface DashboardMetrics {
  claimCount: number;
  totalBilled: number;
  totalPaid: number;
  totalDenied: number;
  totalUnderpaid: number;
  recoverable: number;
  deniedClaimCount: number;
  underpaidClaimCount: number;
  denialRate: number;
  netCollectionRate: number;
}

export async function getDashboardMetrics(
  organizationId: string
): Promise<DashboardMetrics> {
  const where = remitWhere(organizationId);
  const [agg, deniedClaimCount, underpaidClaimCount] = await Promise.all([
    prisma.claim.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        totalCharge: true,
        totalPaid: true,
        deniedAmount: true,
        underpaidAmount: true
      }
    }),
    prisma.claim.count({ where: { ...where, isDenied: true } }),
    prisma.claim.count({ where: { ...where, isUnderpaid: true } })
  ]);

  const claimCount = agg._count._all;
  const totalBilled = Number(agg._sum.totalCharge ?? 0);
  const totalPaid = Number(agg._sum.totalPaid ?? 0);
  const totalDenied = Number(agg._sum.deniedAmount ?? 0);
  const totalUnderpaid = Number(agg._sum.underpaidAmount ?? 0);

  return {
    claimCount,
    totalBilled,
    totalPaid,
    totalDenied,
    totalUnderpaid,
    recoverable: Math.round((totalDenied + totalUnderpaid) * 100) / 100,
    deniedClaimCount,
    underpaidClaimCount,
    denialRate: claimCount > 0 ? deniedClaimCount / claimCount : 0,
    netCollectionRate: totalBilled > 0 ? totalPaid / totalBilled : 0
  };
}

export interface DenialReasonRow {
  groupCode: string;
  reasonCode: string;
  description: string;
  category: DenialCategory;
  amount: number;
  count: number;
}

export async function getDenialReasonBreakdown(
  organizationId: string,
  limit = 8
): Promise<DenialReasonRow[]> {
  const grouped = await prisma.adjustment.groupBy({
    by: ["groupCode", "reasonCode"],
    where: {
      OR: [
        { claim: remitWhere(organizationId) },
        { serviceLine: { claim: remitWhere(organizationId) } }
      ]
    },
    _sum: { amount: true },
    _count: { _all: true }
  });

  const rows: DenialReasonRow[] = [];
  for (const g of grouped) {
    const cls = classifyAdjustment(g.groupCode, g.reasonCode);
    if (!cls.actionable) continue;
    rows.push({
      groupCode: g.groupCode,
      reasonCode: g.reasonCode,
      description: cls.description,
      category: cls.category,
      amount: Number(g._sum.amount ?? 0),
      count: g._count._all
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  return rows.slice(0, limit);
}

export interface CategoryRow {
  category: DenialCategory;
  amount: number;
  count: number;
}

export async function getCategoryBreakdown(
  organizationId: string
): Promise<CategoryRow[]> {
  const reasons = await getDenialReasonBreakdown(organizationId, 1000);
  const map = new Map<DenialCategory, CategoryRow>();
  for (const r of reasons) {
    const existing = map.get(r.category);
    if (existing) {
      existing.amount = Math.round((existing.amount + r.amount) * 100) / 100;
      existing.count += r.count;
    } else {
      map.set(r.category, {
        category: r.category,
        amount: r.amount,
        count: r.count
      });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface PayerRow {
  payerName: string;
  claimCount: number;
  billed: number;
  paid: number;
  denied: number;
  underpaid: number;
  deniedClaims: number;
  denialRate: number;
}

export async function getPayerBreakdown(
  organizationId: string
): Promise<PayerRow[]> {
  const where = remitWhere(organizationId);
  const [grouped, deniedGrouped] = await Promise.all([
    prisma.claim.groupBy({
      by: ["payerName"],
      where,
      _count: { _all: true },
      _sum: {
        totalCharge: true,
        totalPaid: true,
        deniedAmount: true,
        underpaidAmount: true
      }
    }),
    prisma.claim.groupBy({
      by: ["payerName"],
      where: { ...where, isDenied: true },
      _count: { _all: true }
    })
  ]);

  const deniedByPayer = new Map<string, number>();
  for (const d of deniedGrouped) {
    deniedByPayer.set(d.payerName ?? "Unknown", d._count._all);
  }

  return grouped
    .map((g) => {
      const name = g.payerName ?? "Unknown";
      const claimCount = g._count._all;
      const deniedClaims = deniedByPayer.get(name) ?? 0;
      return {
        payerName: name,
        claimCount,
        billed: Number(g._sum.totalCharge ?? 0),
        paid: Number(g._sum.totalPaid ?? 0),
        denied: Number(g._sum.deniedAmount ?? 0),
        underpaid: Number(g._sum.underpaidAmount ?? 0),
        deniedClaims,
        denialRate: claimCount > 0 ? deniedClaims / claimCount : 0
      };
    })
    .sort((a, b) => b.denied + b.underpaid - (a.denied + a.underpaid));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface MonthlyTrendRow {
  /** Calendar month bucket, "YYYY-MM". */
  month: string;
  billed: number;
  paid: number;
  denied: number;
  underpaid: number;
  claimCount: number;
  denialRate: number;
}

/**
 * Billed/paid/denied/underpaid totals per calendar month over the last N months,
 * for 835 (remittance) claims. A claim is bucketed by the most meaningful date
 * available — service date, falling back to paid date, then createdAt — so it
 * lands in the period the work was performed/paid even when one field is null.
 */
export async function getMonthlyTrend(
  organizationId: string,
  months = 6
): Promise<MonthlyTrendRow[]> {
  // Build the contiguous list of month buckets (oldest → newest) so months with
  // no claims still render as zero rows.
  const now = new Date();
  const buckets: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push(monthKey(d));
  }
  const earliest = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
  );

  const claims = await prisma.claim.findMany({
    where: {
      ...remitWhere(organizationId),
      // Keep the scan bounded: anything created in/after the window's first
      // month is a candidate (createdAt is the latest-possible bucket date).
      createdAt: { gte: earliest }
    },
    select: {
      serviceDate: true,
      paidDate: true,
      createdAt: true,
      totalCharge: true,
      totalPaid: true,
      deniedAmount: true,
      underpaidAmount: true,
      isDenied: true
    }
  });

  const rows = new Map<string, MonthlyTrendRow & { deniedClaims: number }>();
  for (const key of buckets) {
    rows.set(key, {
      month: key,
      billed: 0,
      paid: 0,
      denied: 0,
      underpaid: 0,
      claimCount: 0,
      denialRate: 0,
      deniedClaims: 0
    });
  }

  for (const c of claims) {
    const date = c.serviceDate ?? c.paidDate ?? c.createdAt;
    const key = monthKey(date);
    const row = rows.get(key);
    if (!row) continue; // outside the requested window
    row.billed += Number(c.totalCharge ?? 0);
    row.paid += Number(c.totalPaid ?? 0);
    row.denied += Number(c.deniedAmount ?? 0);
    row.underpaid += Number(c.underpaidAmount ?? 0);
    row.claimCount += 1;
    if (c.isDenied) row.deniedClaims += 1;
  }

  return buckets.map((key) => {
    const r = rows.get(key)!;
    return {
      month: r.month,
      billed: round2(r.billed),
      paid: round2(r.paid),
      denied: round2(r.denied),
      underpaid: round2(r.underpaid),
      claimCount: r.claimCount,
      denialRate: r.claimCount > 0 ? r.deniedClaims / r.claimCount : 0
    };
  });
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface ProviderRow {
  npi: string;
  claimCount: number;
  billed: number;
  paid: number;
  denied: number;
  underpaid: number;
  denialRate: number;
}

/**
 * Revenue leakage grouped by rendering provider (NPI) for 835 claims. Sorted by
 * recoverable dollars (denied + underpaid) descending and capped to the worst
 * offenders. Claims with no NPI are bucketed as "Unattributed".
 */
export async function getProviderBreakdown(
  organizationId: string,
  limit = 10
): Promise<ProviderRow[]> {
  const where = remitWhere(organizationId);
  const [grouped, deniedGrouped] = await Promise.all([
    prisma.claim.groupBy({
      by: ["renderingProviderNpi"],
      where,
      _count: { _all: true },
      _sum: {
        totalCharge: true,
        totalPaid: true,
        deniedAmount: true,
        underpaidAmount: true
      }
    }),
    prisma.claim.groupBy({
      by: ["renderingProviderNpi"],
      where: { ...where, isDenied: true },
      _count: { _all: true }
    })
  ]);

  const UNATTRIBUTED = "Unattributed";
  const deniedByNpi = new Map<string, number>();
  for (const d of deniedGrouped) {
    deniedByNpi.set(d.renderingProviderNpi ?? UNATTRIBUTED, d._count._all);
  }

  return grouped
    .map((g) => {
      const npi = g.renderingProviderNpi ?? UNATTRIBUTED;
      const claimCount = g._count._all;
      const deniedClaims = deniedByNpi.get(npi) ?? 0;
      return {
        npi,
        claimCount,
        billed: Number(g._sum.totalCharge ?? 0),
        paid: Number(g._sum.totalPaid ?? 0),
        denied: Number(g._sum.deniedAmount ?? 0),
        underpaid: Number(g._sum.underpaidAmount ?? 0),
        denialRate: claimCount > 0 ? deniedClaims / claimCount : 0
      };
    })
    .sort((a, b) => b.denied + b.underpaid - (a.denied + a.underpaid))
    .slice(0, limit);
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import {
  getCategoryBreakdown,
  getDashboardMetrics,
  getDenialReasonBreakdown,
  getPayerBreakdown
} from "@/lib/analytics/metrics";
import { getUnadjudicatedClaims } from "@/lib/analytics/matching";
import { generateInsights } from "@/lib/insights";
import { generateInsightsWithFallback } from "@/lib/ai/insights";
import { OnboardingPanel } from "@/components/OnboardingPanel";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  BarList,
  InsightsPanel,
  KpiCard,
  SectionCard,
  StatusBadge
} from "@/components/dashboard-ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const orgId = user.organizationId;

  const [metrics, categories, reasons, payers, flagged, unadjudicated] =
    await Promise.all([
      getDashboardMetrics(orgId),
      getCategoryBreakdown(orgId),
      getDenialReasonBreakdown(orgId),
      getPayerBreakdown(orgId),
      prisma.claim.findMany({
        where: {
          organizationId: orgId,
          ediFile: { type: "X835" },
          OR: [{ isDenied: true }, { isUnderpaid: true }]
        },
        orderBy: [{ deniedAmount: "desc" }, { underpaidAmount: "desc" }],
        take: 8
      }),
      getUnadjudicatedClaims(orgId)
    ]);

  // Try AI-generated insights first; on any failure (disabled, error, or the
  // post-gen verifier rejecting a hallucination) fall back to the deterministic
  // rule-based insights. The user always sees *some* insights.
  const insights = await generateInsightsWithFallback(
    { metrics, categories, reasons, payers },
    generateInsights
  );

  if (metrics.claimCount === 0) {
    return <OnboardingPanel />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Denial &amp; Underpayment Intelligence
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Across {metrics.claimCount} adjudicated claims from remittance data.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Billed" value={formatCurrency(metrics.totalBilled)} />
        <KpiCard
          label="Net paid"
          value={formatCurrency(metrics.totalPaid)}
          sub={`${formatPercent(metrics.netCollectionRate)} of billed`}
          accent="success"
        />
        <KpiCard
          label="Denied (actionable)"
          value={formatCurrency(metrics.totalDenied)}
          sub={`${metrics.deniedClaimCount} claims`}
          accent="danger"
        />
        <KpiCard
          label="Underpaid"
          value={formatCurrency(metrics.totalUnderpaid)}
          sub={`${metrics.underpaidClaimCount} claims`}
          accent="warning"
        />
        <KpiCard
          label="Recoverable"
          value={formatCurrency(metrics.recoverable)}
          sub="Denials + underpayments"
          accent="danger"
        />
        <KpiCard
          label="Denial rate"
          value={formatPercent(metrics.denialRate)}
          sub="By claim count"
          accent={metrics.denialRate > 0.1 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Denial dollars by category">
            <BarList
              items={categories.map((c) => ({
                label: c.category,
                value: c.amount,
                meta: `${c.count} adjustments`
              }))}
              emptyLabel="No actionable denials detected."
            />
          </SectionCard>

          <SectionCard title="Top denial reasons (CARC)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Code</th>
                    <th className="pb-2 pr-4 font-medium">Reason</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 text-right font-medium">Amount</th>
                    <th className="pb-2 text-right font-medium">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-slate-500">
                        No actionable denials detected.
                      </td>
                    </tr>
                  ) : (
                    reasons.map((r) => (
                      <tr
                        key={`${r.groupCode}-${r.reasonCode}`}
                        className="border-b border-slate-100"
                      >
                        <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                          {r.groupCode}-{r.reasonCode}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">
                          {r.description}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">{r.category}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-900">
                          {formatCurrency(r.amount)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-slate-500">
                          {r.count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Insights">
          <InsightsPanel insights={insights} />
        </SectionCard>
      </div>

      <SectionCard title="Revenue leakage by payer">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Payer</th>
                <th className="pb-2 pr-4 text-right font-medium">Claims</th>
                <th className="pb-2 pr-4 text-right font-medium">Billed</th>
                <th className="pb-2 pr-4 text-right font-medium">Paid</th>
                <th className="pb-2 pr-4 text-right font-medium">Denied</th>
                <th className="pb-2 pr-4 text-right font-medium">Underpaid</th>
                <th className="pb-2 text-right font-medium">Denial rate</th>
              </tr>
            </thead>
            <tbody>
              {payers.map((p) => (
                <tr key={p.payerName} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {p.payerName}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {p.claimCount}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCurrency(p.billed)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCurrency(p.paid)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-rose-600">
                    {formatCurrency(p.denied)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-amber-600">
                    {formatCurrency(p.underpaid)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPercent(p.denialRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Top flagged claims"
        action={
          <Link href="/claims" className="text-sm font-semibold text-brand-600">
            View all
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Claim</th>
                <th className="pb-2 pr-4 font-medium">Patient</th>
                <th className="pb-2 pr-4 font-medium">Payer</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Denied</th>
                <th className="pb-2 pr-4 text-right font-medium">Underpaid</th>
                <th className="pb-2 font-medium">Primary reason</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/claims/${c.id}`}
                      className="font-mono text-xs font-semibold text-brand-600"
                    >
                      {c.patientControlNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {c.patientName ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{c.payerName}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge denied={c.isDenied} underpaid={c.isUnderpaid} />
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-rose-600">
                    {formatCurrency(Number(c.deniedAmount))}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-amber-600">
                    {formatCurrency(Number(c.underpaidAmount))}
                  </td>
                  <td className="py-2 text-slate-600">
                    {c.primaryDenialReason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {unadjudicated.count > 0 ? (
        <SectionCard
          title="Submitted, not adjudicated (at risk)"
          action={
            <span className="text-sm font-semibold text-rose-600">
              {formatCurrency(unadjudicated.billedAtRisk)} at risk ·{" "}
              {unadjudicated.count} claim{unadjudicated.count === 1 ? "" : "s"}
            </span>
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Claims you submitted (837) with no remittance (835) on file — the
            payer may never have adjudicated them. Left unworked, these run into
            timely-filing deadlines.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Claim</th>
                  <th className="pb-2 pr-4 font-medium">Payer</th>
                  <th className="pb-2 pr-4 text-right font-medium">Billed</th>
                  <th className="pb-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {unadjudicated.claims.slice(0, 10).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/claims/${c.id}`}
                        className="font-mono text-xs font-semibold text-brand-600"
                      >
                        {c.patientControlNumber ?? c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{c.payerName ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCurrency(c.totalCharge)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {c.ageDays === null ? "—" : `${c.ageDays}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

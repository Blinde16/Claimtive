import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import {
  getArAging,
  getCategoryBreakdown,
  getChargeWaterfall,
  getDashboardMetrics,
  getDenialReasonBreakdown,
  getMonthlyTrend,
  getPayerBreakdown,
  getProviderBreakdown,
  getRecoveredSummary
} from "@/lib/analytics/metrics";
import {
  getCobFollowUps,
  getPatientResponsibilitySummary
} from "@/lib/analytics/leakage";
import { getUnadjudicatedClaims } from "@/lib/analytics/matching";
import { generateInsights } from "@/lib/insights";
import { generateInsightsWithFallback } from "@/lib/ai/insights";
import { OnboardingPanel } from "@/components/OnboardingPanel";
import { InfoTip } from "@/components/InfoTip";
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

  const [
    metrics,
    categories,
    reasons,
    payers,
    trend,
    providers,
    flagged,
    unadjudicated,
    patientResp,
    cob,
    recovered,
    waterfall,
    arAging
  ] = await Promise.all([
    getDashboardMetrics(orgId),
    getCategoryBreakdown(orgId),
    getDenialReasonBreakdown(orgId),
    getPayerBreakdown(orgId),
    getMonthlyTrend(orgId),
    getProviderBreakdown(orgId),
    prisma.claim.findMany({
      where: {
        organizationId: orgId,
        ediFile: { type: "X835" },
        OR: [{ isDenied: true }, { isUnderpaid: true }]
      },
      orderBy: [{ deniedAmount: "desc" }, { underpaidAmount: "desc" }],
      take: 8
    }),
    getUnadjudicatedClaims(orgId),
    getPatientResponsibilitySummary(orgId),
    getCobFollowUps(orgId),
    getRecoveredSummary(orgId),
    getChargeWaterfall(orgId),
    getArAging(orgId)
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-7">
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
          label="Recovered to date"
          value={formatCurrency(recovered.totalRecovered)}
          sub={`${formatPercent(recovered.recoveryRate)} of recoverable`}
          accent="success"
        />
        <KpiCard
          label="Denial rate"
          value={formatPercent(metrics.denialRate)}
          sub="By claim count"
          accent={metrics.denialRate > 0.1 ? "danger" : "default"}
        />
      </div>

      {/* Plain-English glossary for the KPI jargon above. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <InfoTip
          label="Denied (actionable)"
          text="Adjustment dollars from recoverable payer denials worth working — excludes expected write-offs and patient responsibility."
        />
        <InfoTip
          label="Recoverable"
          text="Denied (actionable) plus underpayments — the total dollars potentially recoverable from payers."
        />
      </div>

      {(() => {
        const segments = [
          {
            label: "Net paid",
            value: waterfall.paid,
            barClass: "bg-emerald-500",
            dotClass: "bg-emerald-500"
          },
          {
            label: "Contractual write-offs",
            value: waterfall.contractual,
            barClass: "bg-slate-400",
            dotClass: "bg-slate-400"
          },
          {
            label: "Patient responsibility",
            value: waterfall.patientResp,
            barClass: "bg-sky-500",
            dotClass: "bg-sky-500"
          },
          {
            label: "Other / COB",
            value: waterfall.other,
            barClass: "bg-amber-500",
            dotClass: "bg-amber-500"
          },
          // Only show the residual if it's a real, non-reconciling gap.
          ...(waterfall.unclassified > 0
            ? [
                {
                  label: "Unclassified",
                  value: waterfall.unclassified,
                  barClass: "bg-rose-500",
                  dotClass: "bg-rose-500"
                }
              ]
            : [])
        ].filter((s) => s.value > 0);

        const billed = waterfall.billed;
        const pct = (v: number) => (billed > 0 ? (v / billed) * 100 : 0);

        return (
          <SectionCard
            title="Where your billed dollars went"
            action={
              <span className="text-sm font-semibold text-slate-700">
                {formatCurrency(billed)} billed
              </span>
            }
          >
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
              {segments.map((s) => (
                <div
                  key={s.label}
                  className={`h-full ${s.barClass}`}
                  style={{ width: `${Math.max(pct(s.value), 1.5)}%` }}
                  title={`${s.label}: ${formatCurrency(s.value)}`}
                />
              ))}
            </div>
            <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {segments.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dotClass}`}
                  />
                  <span className="text-slate-700">{s.label}</span>
                  <span className="ml-auto tabular-nums text-slate-900">
                    {formatCurrency(s.value)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-400">
                    {formatPercent(pct(s.value) / 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              Of the above, {formatCurrency(waterfall.recoverableDenied)} is
              recoverable (actionable denials) and you were underpaid{" "}
              {formatCurrency(waterfall.underpaid)} below contract — that&apos;s
              your recoverable opportunity.
            </p>
          </SectionCard>
        );
      })()}

      {metrics.totalUnderpaid === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Underpayments show $0 — load your contracted rates on the{" "}
          <Link href="/contracts" className="font-semibold underline">
            Contracts page
          </Link>{" "}
          to enable underpayment detection.
        </div>
      ) : null}

      <SectionCard title="Recoverable A/R by age">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Age (days)</th>
                <th className="pb-2 pr-4 text-right font-medium">Claims</th>
                <th className="pb-2 text-right font-medium">Recoverable</th>
              </tr>
            </thead>
            <tbody>
              {arAging.map((b) => {
                const isOldest = b.label === "90+";
                return (
                  <tr
                    key={b.label}
                    className={`border-b border-slate-100 ${
                      isOldest ? "bg-rose-50" : ""
                    }`}
                  >
                    <td
                      className={`py-2 pr-4 font-medium ${
                        isOldest ? "text-rose-700" : "text-slate-800"
                      }`}
                    >
                      {b.label}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right tabular-nums ${
                        isOldest ? "text-rose-700" : "text-slate-600"
                      }`}
                    >
                      {b.count}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        isOldest ? "font-semibold text-rose-700" : "text-slate-900"
                      }`}
                    >
                      {formatCurrency(b.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Older claims risk running past payer timely-filing deadlines — work the
          oldest first.
        </p>
      </SectionCard>

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
                    <th className="pb-2 pr-4 font-medium">
                      <InfoTip
                        label="CARC"
                        text="Claim Adjustment Reason Code — the standardized X12 code (group + reason) the payer used to explain each adjustment."
                      />
                    </th>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Trend (last 6 months)">
          <p className="mb-3 text-xs text-slate-500">
            Recoverable dollars (denied + underpaid) and denial rate by month.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Month</th>
                  <th className="pb-2 pr-4 text-right font-medium">Claims</th>
                  <th className="pb-2 pr-4 text-right font-medium">Billed</th>
                  <th className="pb-2 pr-4 text-right font-medium">Denied</th>
                  <th className="pb-2 pr-4 text-right font-medium">Underpaid</th>
                  <th className="pb-2 text-right font-medium">Denial rate</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((m) => (
                  <tr key={m.month} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {m.month}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                      {m.claimCount}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCurrency(m.billed)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-rose-600">
                      {formatCurrency(m.denied)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-amber-600">
                      {formatCurrency(m.underpaid)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPercent(m.denialRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Revenue leakage by provider">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">
                    <InfoTip
                      label="NPI"
                      text="National Provider Identifier — the rendering provider who performed the service."
                    />
                  </th>
                  <th className="pb-2 pr-4 text-right font-medium">Claims</th>
                  <th className="pb-2 pr-4 text-right font-medium">Denied</th>
                  <th className="pb-2 pr-4 text-right font-medium">Underpaid</th>
                  <th className="pb-2 text-right font-medium">Denial rate</th>
                </tr>
              </thead>
              <tbody>
                {providers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-slate-500">
                      No provider-attributed claims yet.
                    </td>
                  </tr>
                ) : (
                  providers.map((p) => (
                    <tr key={p.npi} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-800">
                        {p.npi}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                        {p.claimCount}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {patientResp.claimCount > 0 || cob.count > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {patientResp.claimCount > 0 ? (
            <SectionCard
              title="Patient responsibility (collectible)"
              action={
                <span className="text-sm font-semibold text-slate-700">
                  {formatCurrency(patientResp.total)} ·{" "}
                  {patientResp.claimCount} claim
                  {patientResp.claimCount === 1 ? "" : "s"}
                </span>
              }
            >
              <p className="mb-3 text-xs text-slate-500">
                Balances the payer assigned to patients — deductible, coinsurance,
                and copay. Not a payer denial, but collectible revenue via patient
                statements. Tracked here so it isn&apos;t left on the table.
              </p>
              <BarList
                items={patientResp.byType.map((t) => ({
                  label: t.label,
                  value: t.amount,
                  meta: `${t.count} adjustment${t.count === 1 ? "" : "s"}`
                }))}
                emptyLabel="No patient-responsibility detail available."
              />
            </SectionCard>
          ) : null}

          {cob.count > 0 ? (
            <SectionCard
              title="Coordination of benefits — verify secondary billed"
              action={
                <span className="text-sm font-semibold text-amber-600">
                  {formatCurrency(cob.amountToCoordinate)} · {cob.count} claim
                  {cob.count === 1 ? "" : "s"}
                </span>
              }
            >
              <p className="mb-3 text-xs text-slate-500">
                The primary payer indicated another payer is responsible (CARC
                22/109/19). Confirm the secondary claim was billed. These dollars
                are already counted in actionable denials above — this view
                isolates the{" "}
                <InfoTip
                  className="align-baseline"
                  label="COB"
                  text="Coordination of Benefits — when more than one payer covers a patient, COB determines payment order so the secondary payer can be billed the remaining balance."
                />{" "}
                subset so it gets worked.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-4 font-medium">Claim</th>
                      <th className="pb-2 pr-4 font-medium">Payer</th>
                      <th className="pb-2 text-right font-medium">To coordinate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cob.claims.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <Link
                            href={`/claims/${c.id}`}
                            className="font-mono text-xs font-semibold text-brand-600"
                          >
                            {c.patientControlNumber ?? c.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {c.payerName ?? "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-amber-600">
                          {formatCurrency(c.cobAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

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

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatCurrency, formatCurrencyPrecise, formatDate } from "@/lib/format";
import {
  classifyAdjustment,
  describeRemark,
  GROUP_CODES
} from "@/lib/analytics/carc";
import { StatusBadge } from "@/components/dashboard-ui";
import { ClaimWorkPanel } from "@/components/ClaimWorkPanel";
import { AppealDrafter } from "@/components/AppealDrafter";
import { isAiEnabled } from "@/lib/ai/vertex";
import { recordAudit } from "@/lib/audit";

export const metadata = { title: "Claim detail" };

export default async function ClaimDetailPage({
  params
}: {
  params: { id: string };
}) {
  const user = (await getCurrentUser())!;
  const claim = await prisma.claim.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      ediFile: true,
      adjustments: true,
      serviceLines: {
        include: { adjustments: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!claim) notFound();

  // HIPAA access log: record that this user viewed this patient's claim.
  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "claim.view",
    targetType: "claim",
    targetId: claim.id
  });

  const isRemit = claim.ediFile.type === "X835";
  const canAppeal = isRemit && (claim.isDenied || claim.isUnderpaid) && isAiEnabled();

  // Org members for the worklist assignee dropdown.
  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/claims" className="text-sm font-semibold text-brand-600">
          ← Back to claims
        </Link>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-semibold text-slate-900">
                {claim.patientControlNumber ?? claim.id.slice(0, 8)}
              </h1>
              {isRemit ? (
                <StatusBadge denied={claim.isDenied} underpaid={claim.isUnderpaid} />
              ) : (
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Submitted claim
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {claim.patientName ?? "Unknown patient"} · {claim.payerName} ·{" "}
              {claim.statusLabel ?? "—"}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-slate-400">Billed</dt>
              <dd className="font-semibold text-slate-900">
                {formatCurrency(Number(claim.totalCharge))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Paid</dt>
              <dd className="font-semibold text-emerald-600">
                {formatCurrency(Number(claim.totalPaid))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Denied</dt>
              <dd className="font-semibold text-rose-600">
                {formatCurrency(Number(claim.deniedAmount))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Underpaid</dt>
              <dd className="font-semibold text-amber-600">
                {formatCurrency(Number(claim.underpaidAmount))}
              </dd>
            </div>
            {Number(claim.recoveredAmount) > 0 ? (
              <div>
                <dt className="text-xs uppercase text-slate-400">Recovered</dt>
                <dd className="font-semibold text-emerald-600">
                  {formatCurrency(Number(claim.recoveredAmount))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {claim.primaryDenialReason ? (
          <div className="mt-4 rounded-lg border-l-4 border-l-rose-500 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-800">
              Primary denial reason · CARC {claim.primaryDenialCode}
            </p>
            <p className="text-sm text-rose-700">{claim.primaryDenialReason}</p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
          <span>Service date: {formatDate(claim.serviceDate)}</span>
          {isRemit ? <span>Paid date: {formatDate(claim.paidDate)}</span> : null}
          <span>Payer claim #: {claim.payerClaimControlNumber ?? "—"}</span>
          <span>Rendering NPI: {claim.renderingProviderNpi ?? "—"}</span>
          <span>
            Source:{" "}
            <Link
              href={`/claims?file=${claim.ediFileId}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {claim.ediFile.fileName}
            </Link>
          </span>
        </div>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Worklist
        </h2>
        <ClaimWorkPanel
          claimId={claim.id}
          workStatus={claim.workStatus}
          workNote={claim.workNote}
          assignedToId={claim.assignedToId}
          recoveredAmount={Number(claim.recoveredAmount)}
          resolutionOutcome={claim.resolutionOutcome}
          users={users}
        />
      </section>

      {canAppeal ? (
        <section className="card p-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Appeal letter
            </h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              AI-assisted
            </span>
          </div>
          <AppealDrafter
            claimId={claim.id}
            patientControlNumber={claim.patientControlNumber}
          />
        </section>
      ) : null}

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Service lines
        </h2>
        <div className="space-y-4">
          {claim.serviceLines.map((line) => (
            <div
              key={line.id}
              className="rounded-lg border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                    {line.procedureCode}
                    {line.modifier ? `-${line.modifier}` : ""}
                  </span>
                  <span className="text-xs text-slate-500">
                    {Number(line.units)} unit(s)
                  </span>
                  {isRemit ? (
                    <StatusBadge denied={line.isDenied} underpaid={line.isUnderpaid} />
                  ) : null}
                </div>
                <div className="flex gap-6 text-sm">
                  <span className="text-slate-500">
                    Charge{" "}
                    <span className="font-semibold text-slate-900">
                      {formatCurrencyPrecise(Number(line.chargeAmount))}
                    </span>
                  </span>
                  {isRemit ? (
                    <>
                      <span className="text-slate-500">
                        Allowed{" "}
                        <span className="font-semibold text-slate-900">
                          {formatCurrencyPrecise(Number(line.allowedAmount))}
                        </span>
                      </span>
                      <span className="text-slate-500">
                        Paid{" "}
                        <span className="font-semibold text-emerald-600">
                          {formatCurrencyPrecise(Number(line.paidAmount))}
                        </span>
                      </span>
                    </>
                  ) : null}
                  {line.contractedRate != null ? (
                    <span className="text-slate-500">
                      Contracted{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCurrencyPrecise(Number(line.contractedRate))}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              {line.isUnderpaid ? (
                <p className="mt-2 text-sm text-amber-700">
                  Underpaid by{" "}
                  {formatCurrencyPrecise(Number(line.underpaidAmount))} versus the
                  contracted rate.
                </p>
              ) : null}

              {line.adjustments.length > 0 ? (
                <table className="mt-3 w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pb-1 pr-4 font-medium">Group</th>
                      <th className="pb-1 pr-4 font-medium">CARC</th>
                      <th className="pb-1 pr-4 font-medium">Reason</th>
                      <th className="pb-1 pr-4 font-medium">Type</th>
                      <th className="pb-1 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {line.adjustments.map((adj) => {
                      const cls = classifyAdjustment(adj.groupCode, adj.reasonCode);
                      return (
                        <tr key={adj.id} className="text-slate-600">
                          <td className="py-0.5 pr-4">
                            {GROUP_CODES[adj.groupCode] ?? adj.groupCode}
                          </td>
                          <td className="py-0.5 pr-4 font-mono">
                            {adj.reasonCode}
                          </td>
                          <td className="py-0.5 pr-4">{cls.description}</td>
                          <td className="py-0.5 pr-4">
                            <span
                              className={
                                cls.actionable
                                  ? "font-medium text-rose-600"
                                  : "text-slate-400"
                              }
                            >
                              {cls.actionable ? "Recoverable" : "Expected"}
                            </span>
                          </td>
                          <td className="py-0.5 text-right tabular-nums">
                            {formatCurrencyPrecise(Number(adj.amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}

              {line.remarkCodes.length > 0 ? (
                <div className="mt-2 text-xs text-slate-500">
                  {line.remarkCodes.map((code) => (
                    <span key={code} className="mr-3">
                      <span className="font-mono">{code}</span>:{" "}
                      {describeRemark(code)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

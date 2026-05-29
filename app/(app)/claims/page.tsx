import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard-ui";
import { InfoTip } from "@/components/InfoTip";
import {
  buildClaimWhere,
  CLAIM_FILTERS,
  normalizeFilter
} from "@/lib/claimsFilter";
import {
  WORK_STATUSES,
  WORK_STATUS_BADGE,
  WORK_STATUS_LABELS,
  isWorkStatus
} from "@/lib/worklist";

export const metadata = { title: "Claims" };

export default async function ClaimsPage({
  searchParams
}: {
  searchParams: { filter?: string; q?: string; status?: string; file?: string };
}) {
  const user = (await getCurrentUser())!;
  const orgId = user.organizationId;
  const filter = normalizeFilter(searchParams.filter);
  const q = (searchParams.q ?? "").trim();
  const status =
    searchParams.status && isWorkStatus(searchParams.status)
      ? searchParams.status
      : "";
  const file = (searchParams.file ?? "").trim();

  const where = buildClaimWhere(orgId, { filter, q, status, file });

  // When drilling in from the Uploads page, load the source file for context
  // (and to confirm it belongs to this org — a bad/foreign id yields no banner
  // and, since ediFileId won't match, no claims).
  const sourceFile = file
    ? await prisma.ediFile.findFirst({
        where: { id: file, organizationId: orgId },
        select: {
          fileName: true,
          type: true,
          createdAt: true,
          claimCount: true,
          totalDenied: true,
          totalUnderpaid: true
        }
      })
    : null;

  const claims = await prisma.claim.findMany({
    where,
    include: {
      ediFile: { select: { type: true } },
      assignedTo: { select: { name: true } }
    },
    orderBy: [
      { deniedAmount: "desc" },
      { underpaidAmount: "desc" },
      { createdAt: "desc" }
    ],
    take: 100
  });

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { filter, q, status, file, ...overrides };
    if (merged.filter && merged.filter !== "all") params.set("filter", merged.filter);
    if (merged.q) params.set("q", merged.q);
    if (merged.status) params.set("status", merged.status);
    if (merged.file) params.set("file", merged.file);
    return params.toString();
  };

  const buildHref = (key: string) => {
    const s = queryString({ filter: key });
    return s ? `/claims?${s}` : "/claims";
  };

  const exportHref = `/claims/export${queryString({}) ? `?${queryString({})}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Claims</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap gap-2" action="/claims">
            {filter !== "all" ? (
              <input type="hidden" name="filter" value={filter} />
            ) : null}
            {file ? <input type="hidden" name="file" value={file} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search claim ID or patient"
              className="input w-56"
            />
            <select name="status" defaultValue={status} className="input">
              <option value="">All statuses</option>
              {WORK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {WORK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary">
              Search
            </button>
          </form>
          <a href={exportHref} className="btn-secondary" download>
            Export CSV
          </a>
        </div>
      </div>

      {sourceFile ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="text-sm text-slate-700">
            Showing claims from{" "}
            <span className="font-semibold text-slate-900">
              {sourceFile.fileName}
            </span>{" "}
            <span className="text-slate-500">
              ({sourceFile.type === "X835" ? "835 remittance" : "837 claim"} ·
              uploaded {formatDate(sourceFile.createdAt)} · {sourceFile.claimCount}{" "}
              claim{sourceFile.claimCount === 1 ? "" : "s"}
              {sourceFile.type === "X835"
                ? ` · ${formatCurrency(Number(sourceFile.totalDenied))} denied · ${formatCurrency(
                    Number(sourceFile.totalUnderpaid)
                  )} underpaid`
                : ""}
              )
            </span>
          </div>
          <Link
            href="/claims"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Clear · view all claims
          </Link>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex gap-2">
          {CLAIM_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={buildHref(f.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === f.key
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          <InfoTip
            label="Recoverable"
            text="A subset of denied claims that still have denial dollars worth appealing — money you can realistically chase, not routine write-offs."
          />{" "}
          claims show in the Denied view; clear all filters to see Clean (paid in
          full) claims alongside them.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Claim ID</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 font-medium">Service date</th>
                <th className="px-4 py-3 font-medium">
                  <InfoTip
                    label="Outcome"
                    text="How the payer settled the claim. Denied = payer paid nothing on at least one line. Underpaid = paid less than your contracted rate. Recoverable = denied dollars worth appealing. Clean = paid in full with nothing to chase."
                  />
                </th>
                <th className="px-4 py-3 font-medium">Work</th>
                <th className="px-4 py-3 text-right font-medium">Billed</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">
                  <InfoTip
                    className="justify-end"
                    label="Denied"
                    text="Actionable denial dollars worth appealing — excludes routine contractual write-offs and patient responsibility."
                  />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <InfoTip
                    className="justify-end"
                    label="Underpaid"
                    text="Paid less than your contracted rate for the procedure."
                  />
                </th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    No claims match this view.
                  </td>
                </tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/claims/${c.id}`}
                        className="font-mono text-xs font-semibold text-brand-600"
                      >
                        {c.patientControlNumber ?? c.id.slice(0, 8)}
                      </Link>
                      {c.ediFile.type === "X837" ? (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                          837
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.patientName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.payerName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(c.serviceDate)}
                    </td>
                    <td className="px-4 py-3">
                      {c.ediFile.type === "X837" ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Submitted
                        </span>
                      ) : (
                        <StatusBadge
                          denied={c.isDenied}
                          underpaid={c.isUnderpaid}
                          recoverable={Number(c.deniedAmount) > 0}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isWorkStatus(c.workStatus) ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${WORK_STATUS_BADGE[c.workStatus]}`}
                          title={c.assignedTo?.name ? `Assigned: ${c.assignedTo.name}` : undefined}
                        >
                          {WORK_STATUS_LABELS[c.workStatus]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(Number(c.totalCharge))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(Number(c.totalPaid))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                      {Number(c.deniedAmount) > 0
                        ? formatCurrency(Number(c.deniedAmount))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                      {Number(c.underpaidAmount) > 0
                        ? formatCurrency(Number(c.underpaidAmount))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/claims/${c.id}`}
                        className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {claims.length === 100 ? (
        <p className="text-xs text-slate-400">Showing the first 100 claims.</p>
      ) : null}
    </div>
  );
}

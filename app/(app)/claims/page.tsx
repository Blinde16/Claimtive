import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard-ui";
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
  searchParams: { filter?: string; q?: string; status?: string };
}) {
  const user = (await getCurrentUser())!;
  const orgId = user.organizationId;
  const filter = normalizeFilter(searchParams.filter);
  const q = (searchParams.q ?? "").trim();
  const status =
    searchParams.status && isWorkStatus(searchParams.status)
      ? searchParams.status
      : "";

  const where = buildClaimWhere(orgId, { filter, q, status });

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
    const merged = { filter, q, status, ...overrides };
    if (merged.filter && merged.filter !== "all") params.set("filter", merged.filter);
    if (merged.q) params.set("q", merged.q);
    if (merged.status) params.set("status", merged.status);
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Claim ID</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 font-medium">Service date</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Work</th>
                <th className="px-4 py-3 text-right font-medium">Billed</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">Denied</th>
                <th className="px-4 py-3 text-right font-medium">Underpaid</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
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
                        <StatusBadge denied={c.isDenied} underpaid={c.isUnderpaid} />
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

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard-ui";

export const metadata = { title: "Claims" };

type Filter = "all" | "denied" | "underpaid" | "clean";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "denied", label: "Denied" },
  { key: "underpaid", label: "Underpaid" },
  { key: "clean", label: "Clean" }
];

export default async function ClaimsPage({
  searchParams
}: {
  searchParams: { filter?: string; q?: string };
}) {
  const user = (await getCurrentUser())!;
  const orgId = user.organizationId;
  const filter = (FILTERS.find((f) => f.key === searchParams.filter)?.key ??
    "all") as Filter;
  const q = (searchParams.q ?? "").trim();

  const where: Prisma.ClaimWhereInput = { organizationId: orgId };
  if (filter === "denied") where.isDenied = true;
  else if (filter === "underpaid") where.isUnderpaid = true;
  else if (filter === "clean") {
    where.isDenied = false;
    where.isUnderpaid = false;
    where.ediFile = { type: "X835" };
  }
  if (q) {
    where.OR = [
      { patientControlNumber: { contains: q, mode: "insensitive" } },
      { patientName: { contains: q, mode: "insensitive" } },
      { payerClaimControlNumber: { contains: q, mode: "insensitive" } }
    ];
  }

  const claims = await prisma.claim.findMany({
    where,
    include: { ediFile: { select: { type: true } } },
    orderBy: [{ deniedAmount: "desc" }, { underpaidAmount: "desc" }, { createdAt: "desc" }],
    take: 100
  });

  const buildHref = (key: Filter) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("filter", key);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/claims?${s}` : "/claims";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Claims</h1>
        <form className="flex gap-2" action="/claims">
          {filter !== "all" ? (
            <input type="hidden" name="filter" value={filter} />
          ) : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search claim ID or patient"
            className="input w-64"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
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
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Billed</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">Denied</th>
                <th className="px-4 py-3 text-right font-medium">Underpaid</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
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

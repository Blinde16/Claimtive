import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDenialRiskClaims } from "@/lib/analytics/denialRisk";
import { formatPercent } from "@/lib/format";
import { SectionCard } from "@/components/dashboard-ui";
import { InfoTip } from "@/components/InfoTip";

export const metadata = { title: "Denial risk" };

export default async function DenialRiskPage() {
  const user = (await getCurrentUser())!;
  const risky = await getDenialRiskClaims(user.organizationId);

  const high = risky.filter((r) => r.level === "high").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Denial risk — prevent before you submit
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submitted claims (837) flagged by how often this payer has historically
          denied the same procedure — learned from{" "}
          <InfoTip
            label="your own remittances"
            text="Risk is computed only from your clinic's past 835 remittance outcomes — fully explainable, no black box. It sharpens as more remittances are processed; cross-clinic benchmarking comes later."
          />
          . Work these before they adjudicate and you turn denials into prevented ones.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-500">
            High risk
          </p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{high}</p>
          <p className="text-xs text-rose-600">submitted claim{high === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-500">
            Elevated risk
          </p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {risky.length - high}
          </p>
          <p className="text-xs text-amber-600">submitted claims</p>
        </div>
      </div>

      {risky.length === 0 ? (
        <SectionCard title="No elevated-risk claims right now">
          <p className="text-sm text-slate-500">
            Upload 837 claim files to see pre-submission risk. As your remittance
            history grows, Claimtive learns which payer + procedure combinations
            tend to deny and flags matching submitted claims here before they
            adjudicate.
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {risky.map((claim) => (
            <div key={claim.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/claims/${claim.id}`}
                    className="font-mono text-sm font-semibold text-brand-600"
                  >
                    {claim.patientControlNumber ?? claim.id.slice(0, 8)}
                  </Link>
                  <span className="text-sm text-slate-600">{claim.payerName ?? "—"}</span>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    claim.level === "high"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {claim.level === "high" ? "High risk" : "Elevated risk"}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {claim.flags.map((f, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">
                        {f.procedureCode}
                        {f.modifier ? `-${f.modifier}` : ""}
                      </span>
                      <span className="text-sm font-medium text-slate-700">
                        Denied {f.deniedCount} of {f.totalCount} past claims (
                        {formatPercent(f.rate, 0)})
                      </span>
                    </div>
                    {f.reason ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Usually denied for: {f.reason}
                        {f.category ? ` (${f.category})` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-brand-700">→ {f.action}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

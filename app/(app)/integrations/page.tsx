import Link from "next/link";
import {
  INTEGRATIONS,
  type Integration,
  type IntegrationStatus,
  type IntegrationCategory
} from "@/lib/integrations";

export const metadata = { title: "Integrations" };

// Honest, color-coded meaning for each status. Clinic owners are domain
// experts — the legend must say exactly what is and isn't available, and the
// per-card badges reuse these same colors so nothing is overstated.
const STATUS_META: Record<
  IntegrationStatus,
  { label: string; legend: string; badge: string; dot: string }
> = {
  live: {
    label: "Live now",
    legend: "Working today — you can use it right now.",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500"
  },
  onboarding: {
    label: "Available at onboarding",
    legend: "We set this up with you when your account is provisioned.",
    badge: "border border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500"
  },
  pilot: {
    label: "In pilot",
    legend: "Live with a limited set of early customers, not yet general.",
    badge: "border border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500"
  },
  roadmap: {
    label: "Roadmap",
    legend: "Planned, not built yet. Shown for transparency.",
    badge: "border border-slate-200 bg-slate-100 text-slate-600",
    dot: "bg-slate-400"
  }
};

// Render order for the four badges in the legend and for grouping.
const STATUS_ORDER: IntegrationStatus[] = [
  "live",
  "onboarding",
  "pilot",
  "roadmap"
];

const CATEGORY_ORDER: IntegrationCategory[] = [
  "Direct",
  "Automated intake",
  "Source system"
];

function StatusBadge({ status }: { status: IntegrationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const isLive = integration.status === "live";

  return (
    <div className="card flex h-full flex-col p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {integration.name}
        </h3>
        <StatusBadge status={integration.status} />
      </div>

      <p className="text-sm leading-relaxed text-slate-500">
        {integration.blurb}
      </p>

      {integration.vendors && integration.vendors.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {integration.vendors.map((vendor) => (
            <li
              key={vendor}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
            >
              {vendor}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-center justify-end">
        {isLive && integration.href ? (
          <Link href={integration.href} className="btn-primary">
            Go to uploads
          </Link>
        ) : (
          // Intentionally NOT a working button — it must not imply the method
          // is connectable in the demo. Non-interactive, disabled-looking.
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
            title={`Not connectable yet — ${STATUS_META[integration.status].label}`}
          >
            Connect
            <span className="ml-2 text-xs font-normal text-slate-400">
              {STATUS_META[integration.status].label}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-600">
        What the badges mean
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          return (
            <div key={status} className="flex flex-col gap-1.5">
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd className="text-xs leading-relaxed text-slate-500">
                {meta.legend}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function IntegrationsPage() {
  // Group catalog entries by category, preserving a stable category order and
  // dropping any category that has no entries.
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: INTEGRATIONS.filter((i) => i.category === category)
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Connect your data</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          How your claims data flows into Claimtive — from manual uploads today
          to automated intake that pulls remittances and claim status in for you.
        </p>
      </div>

      {/* Honesty legend */}
      <StatusLegend />

      {/* Catalog, grouped by category */}
      <div className="space-y-10">
        {grouped.map((group) => (
          <section key={group.category}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.category}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer note */}
      <div className="border-t border-slate-200 pt-6 pb-2">
        <p className="text-xs text-slate-400">
          Statuses reflect what actually works today. Want a specific
          clearinghouse or EMR connection prioritized? Tell your account manager
          and we will scope it with you.
        </p>
      </div>
    </div>
  );
}

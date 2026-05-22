import { formatCurrency } from "@/lib/format";
import type { Insight } from "@/lib/insights";

export function KpiCard({
  label,
  value,
  sub,
  accent = "default"
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "danger" | "warning" | "success";
}) {
  const accentClasses = {
    default: "text-slate-900",
    danger: "text-rose-600",
    warning: "text-amber-600",
    success: "text-emerald-600"
  }[accent];

  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${accentClasses}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function BarList({
  items,
  emptyLabel = "No data"
}: {
  items: { label: string; value: number; meta?: string }[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="tabular-nums text-slate-900">
              {formatCurrency(item.value)}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
            />
          </div>
          {item.meta ? (
            <p className="mt-0.5 text-xs text-slate-400">{item.meta}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const severityStyles: Record<Insight["severity"], string> = {
  high: "border-l-rose-500 bg-rose-50",
  medium: "border-l-amber-500 bg-amber-50",
  low: "border-l-slate-300 bg-slate-50"
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <div
          key={i}
          className={`rounded-r-lg border-l-4 p-3 ${severityStyles[insight.severity]}`}
        >
          <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
          <p className="mt-1 text-sm text-slate-600">{insight.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({
  denied,
  underpaid
}: {
  denied: boolean;
  underpaid: boolean;
}) {
  if (denied) {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
        Denied
      </span>
    );
  }
  if (underpaid) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Underpaid
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Clean
    </span>
  );
}

export function SectionCard({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

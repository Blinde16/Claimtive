import { formatCurrency, formatPercent } from "./format";
import {
  CategoryRow,
  DashboardMetrics,
  DenialReasonRow,
  PayerRow
} from "./analytics/metrics";

export interface Insight {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

// Deterministic, rule-based narrative insights. This is the seam where an LLM
// (Claude) summarizer can later be layered in for richer narratives.
export function generateInsights(input: {
  metrics: DashboardMetrics;
  categories: CategoryRow[];
  reasons: DenialReasonRow[];
  payers: PayerRow[];
}): Insight[] {
  const { metrics, categories, reasons, payers } = input;
  const insights: Insight[] = [];

  if (metrics.claimCount === 0) {
    return [
      {
        title: "No remittance data yet",
        detail:
          "Upload an 835 remittance file to start surfacing denials and underpayments.",
        severity: "low"
      }
    ];
  }

  if (metrics.recoverable > 0) {
    insights.push({
      title: `${formatCurrency(metrics.recoverable)} in recoverable revenue identified`,
      detail: `Across ${metrics.claimCount} adjudicated claims, ${formatCurrency(
        metrics.totalDenied
      )} is tied up in actionable denials and ${formatCurrency(
        metrics.totalUnderpaid
      )} in underpayments versus contracted rates.`,
      severity: metrics.recoverable > metrics.totalPaid * 0.05 ? "high" : "medium"
    });
  }

  const topCategory = categories[0];
  if (topCategory) {
    const share =
      metrics.totalDenied > 0 ? topCategory.amount / metrics.totalDenied : 0;
    insights.push({
      title: `${topCategory.category} is your largest denial driver`,
      detail: `${formatCurrency(topCategory.amount)} (${formatPercent(
        share
      )} of denial dollars) across ${topCategory.count} line adjustments. Targeting this category first yields the highest return.`,
      severity: "high"
    });
  }

  const auth = reasons.find((r) => r.category === "Authorization");
  if (auth) {
    insights.push({
      title: "Prior authorization gaps are costing you",
      detail: `${formatCurrency(
        auth.amount
      )} was denied for missing or exceeded authorizations (CARC ${auth.reasonCode}). These are largely preventable with front-end auth tracking.`,
      severity: "high"
    });
  }

  if (metrics.denialRate > 0.1) {
    insights.push({
      title: `Denial rate of ${formatPercent(metrics.denialRate)} exceeds benchmark`,
      detail: `${metrics.deniedClaimCount} of ${metrics.claimCount} claims were denied. A healthy first-pass denial rate is typically under 5–10%.`,
      severity: metrics.denialRate > 0.2 ? "high" : "medium"
    });
  }

  const worstPayer = payers.find((p) => p.denied + p.underpaid > 0);
  if (worstPayer) {
    insights.push({
      title: `${worstPayer.payerName} accounts for the most leakage`,
      detail: `${formatCurrency(
        worstPayer.denied + worstPayer.underpaid
      )} in denials and underpayments across ${worstPayer.claimCount} claims (${formatPercent(
        worstPayer.denialRate
      )} denial rate). Consider this payer for contract review.`,
      severity: "medium"
    });
  }

  if (metrics.totalUnderpaid > 0) {
    insights.push({
      title: `${formatCurrency(metrics.totalUnderpaid)} in silent underpayments`,
      detail:
        "These claims were paid, but below the contracted rate — they rarely trigger alerts and are easy to miss without rate validation.",
      severity: "medium"
    });
  }

  return insights;
}

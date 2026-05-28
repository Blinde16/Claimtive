// AI insights orchestrator — the single seam that decides whether to use the
// Claude-generated narrative or fall back to the deterministic rule-based one.
//
// Contract:
//   - On success → returns Insight[] (same shape as the rule-based version).
//   - On any failure (AI disabled, Claude error, malformed JSON, verifier
//     rejection) → returns null and the caller falls back to deterministic.
//
// The product never *depends* on the LLM working. If Claude is misconfigured,
// over quota, hallucinating, or just slow — the user still sees insights, just
// the rule-based ones.

import { z } from "zod";
import type { Insight } from "../insights";
import {
  CategoryRow,
  DashboardMetrics,
  DenialReasonRow,
  PayerRow
} from "../analytics/metrics";
import { buildInsightPayload } from "./deidentify";
import { verifyInsightOutput } from "./verify";
import { AiDisabledError, callModel, isAiEnabled } from "./vertex";

const InsightSchema = z.object({
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(800),
  severity: z.enum(["high", "medium", "low"])
});

const ResponseSchema = z.object({
  insights: z.array(InsightSchema).min(1).max(8)
});

const SYSTEM_PROMPT = `You are a senior healthcare Revenue Cycle Management (RCM) analyst.

You will receive a JSON object summarizing one clinic's denial and underpayment
analytics. The numbers were already computed by a deterministic engine that
parsed the payer's X12 835 remittance — they are exact. Your job is to EXPLAIN
and PRIORITIZE them, never to compute or estimate.

HOW THE ENGINE WORKS (so your explanations are accurate):
- "denied" / metrics.totalDenied = ACTIONABLE denial dollars — claims the payer
  refused that are worth appealing/reworking (recoverable). These exclude normal
  write-offs like patient responsibility and contractual adjustments.
- "underpaid" / metrics.totalUnderpaid = claims the payer PAID but BELOW the
  clinic's contracted rate — silent leakage that rarely triggers alerts.
- "recoverable" = denied + underpaid = the total opportunity. Lead with this.
- reasons[] are CARC codes (standardized denial reasons) with a category
  (Authorization, Duplicate, Medical Necessity, Timely Filing, Bundling, etc.)
  that points to the ROOT CAUSE and therefore the fix.

DATA FORMAT (read carefully):
- All dollar fields are US dollars. Write them with a $ and thousands commas,
  e.g. 2295 -> "$2,295".
- denialRate and netCollectionRate and each payer's denialRate are RATIOS from
  0 to 1. Express them as percentages, e.g. 0.5 -> "50%", 0.333 -> "33%".

YOUR OUTPUT: 3–6 short, action-oriented insights for the clinic's billing team.
Each has a title, a 1–2 sentence detail, and a severity (high|medium|low).
- Lead with the biggest recoverable-dollar opportunities (high severity).
- Where useful, add the standard RCM remediation for the root cause (e.g.
  prior-auth gaps -> front-end authorization tracking; timely filing -> tighten
  submission SLAs; duplicates -> claim scrubbing). This advice may be general;
  it does not need to be a number from the input.

CRITICAL RULES:
1. ONLY state dollar amounts and counts that appear in the input JSON. Never
   estimate, invent, or do arithmetic to derive a new number.
2. Only state a PERCENTAGE if it is one of: a denialRate, the netCollectionRate,
   or a category's share of total denied dollars (category.amount /
   metrics.totalDenied). Do not invent other percentages.
3. Reference payer names exactly as written (e.g. "AETNA"). Reference CARC codes
   only when present in reasons[].reasonCode.
4. No medical claims, no advice to patients. You address billing operations.

Output STRICTLY this JSON shape, no commentary, no markdown fences:

{ "insights": [ { "title": string, "detail": string, "severity": "high"|"medium"|"low" }, ... ] }`;

export interface AiInsightsInput {
  metrics: DashboardMetrics;
  categories: CategoryRow[];
  reasons: DenialReasonRow[];
  payers: PayerRow[];
}

export async function generateAiInsights(
  input: AiInsightsInput
): Promise<Insight[] | null> {
  if (!isAiEnabled()) return null;

  let payload;
  try {
    payload = buildInsightPayload(input);
  } catch (err) {
    // deidentify.ts threw because a PHI tripwire fired — fail closed.
    console.error("[ai/insights] de-id refused payload:", err);
    return null;
  }

  let raw: string;
  try {
    raw = await callModel({
      system: SYSTEM_PROMPT,
      user: JSON.stringify(payload),
      maxTokens: 2048,
      temperature: 0
    });
  } catch (err) {
    if (err instanceof AiDisabledError) return null;
    console.error("[ai/insights] model call failed:", err);
    return null;
  }

  // Strip stray markdown fences if Claude added any despite the prompt.
  const json = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed;
  try {
    parsed = ResponseSchema.parse(JSON.parse(json));
  } catch (err) {
    console.error("[ai/insights] malformed response, falling back:", err);
    return null;
  }

  // Post-generation verification — every number/payer/CARC the model emitted
  // must derive from the source payload (within tolerance). Reject otherwise.
  const texts = parsed.insights.flatMap((i) => [i.title, i.detail]);
  const v = verifyInsightOutput(texts, payload);
  if (!v.ok) {
    console.error(
      "[ai/insights] verification failed, falling back. violations:",
      v.violations
    );
    return null;
  }

  return parsed.insights;
}

/**
 * Orchestrator entry point for the dashboard: tries AI first, falls back to the
 * deterministic insights on any failure. Always returns *some* insights.
 */
export async function generateInsightsWithFallback(
  input: AiInsightsInput,
  ruleBased: (input: AiInsightsInput) => Insight[]
): Promise<Insight[]> {
  const ai = await generateAiInsights(input);
  return ai ?? ruleBased(input);
}

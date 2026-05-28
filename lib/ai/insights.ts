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
analytics. The data has been de-identified — it contains no patient names, no
patient identifiers, no service dates, and no provider NPIs. Payer names
(insurance companies) are present and are NOT PHI.

Your job: write 3–6 short, action-oriented insights for the clinic's billing
team. Each insight has a title, a 1–2 sentence detail, and a severity (high,
medium, low).

CRITICAL RULES:
1. ONLY use numbers that appear in the input JSON. Do not estimate, round, or
   invent any figures. If a number is not in the input, do not say it.
2. Reference payer names exactly as written in the input (e.g. "AETNA").
3. Reference CARC codes only when they appear in input.reasons[].reasonCode.
4. Do not make medical claims. Do not give advice to patients. You are
   speaking to the clinic's billing operations, not to consumers.
5. Be specific and quantitative. "Authorization is $800 (35% of denial $)" is
   good. "There are many denials" is not.

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
      maxTokens: 1200,
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

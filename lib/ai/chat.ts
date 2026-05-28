// Claimtive assistant — a chat layer over the clinic's denial/underpayment data.
//
// Same PHI posture as the insights layer: the model only ever sees the
// de-identified AGGREGATES (payers, CARC reasons, category and dollar totals)
// plus a de-identified summary of uploaded files. No patient names, no
// individual-patient rows go to the model. It answers analytical/explanatory
// questions and points the user to the Claims page for specific lookups.

import { prisma } from "../db";
import {
  getCategoryBreakdown,
  getDashboardMetrics,
  getDenialReasonBreakdown,
  getPayerBreakdown
} from "../analytics/metrics";
import { buildInsightPayload } from "./deidentify";
import { callModel, isAiEnabled } from "./vertex";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are Claimtive's Revenue Cycle Management (RCM) assistant for a clinic's
billing team. You help them understand their denial and underpayment data.

You are given a JSON CONTEXT with the clinic's de-identified analytics:
totals, denial rate, denial categories, top CARC reason codes, per-payer
breakdowns, and a summary of uploaded remittance/claim files. By design the
context contains NO patient names or patient identifiers.

How to answer:
- Use the CONTEXT for anything specific to this clinic; use your general RCM /
  CARC / 835/837 knowledge to explain concepts and suggest remediation.
- Dollar fields are US dollars (write with $ and commas). denialRate /
  netCollectionRate / per-payer denialRate are ratios 0..1 — say them as
  percentages (0.5 -> "50%").
- NEVER invent numbers. If a figure isn't in the context, say you don't have it.
- For looking up an individual patient's claim, tell them to use the Claims
  page search/filters — you intentionally don't have patient-level detail.
- No medical advice, no advice to patients. Be concise and practical.`;

/** Build the de-identified context the assistant is allowed to see. */
async function buildChatContext(organizationId: string) {
  const [metrics, categories, reasons, payers, files] = await Promise.all([
    getDashboardMetrics(organizationId),
    getCategoryBreakdown(organizationId),
    getDenialReasonBreakdown(organizationId),
    getPayerBreakdown(organizationId),
    prisma.ediFile.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        fileName: true,
        type: true,
        status: true,
        claimCount: true,
        totalCharged: true,
        totalDenied: true,
        totalUnderpaid: true,
        createdAt: true
      }
    })
  ]);

  const analytics = buildInsightPayload({ metrics, categories, reasons, payers });

  return {
    ...analytics,
    files: files.map((f) => ({
      fileName: f.fileName,
      type: f.type === "X835" ? "remittance (835)" : "claim (837)",
      status: f.status,
      claimCount: f.claimCount,
      billed: Number(f.totalCharged),
      denied: Number(f.totalDenied),
      underpaid: Number(f.totalUnderpaid),
      uploaded: f.createdAt.toISOString().slice(0, 10)
    }))
  };
}

/**
 * Answer a chat turn. Returns the assistant's reply, or null if the AI layer
 * is disabled / errored (the caller shows a graceful message).
 */
export async function answerAssistant(
  organizationId: string,
  history: ChatTurn[]
): Promise<string | null> {
  if (!isAiEnabled()) return null;

  const context = await buildChatContext(organizationId);

  // Flatten a short transcript; keep the last few turns to bound tokens.
  const recent = history.slice(-8);
  const transcript = recent
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  const user = `CONTEXT (de-identified clinic analytics):
${JSON.stringify(context)}

CONVERSATION SO FAR:
${transcript}

Answer the user's most recent message.`;

  try {
    return await callModel({
      system: SYSTEM_PROMPT,
      user,
      json: false,
      maxTokens: 1024,
      temperature: 0.2
    });
  } catch (err) {
    console.error("[ai/chat] assistant call failed:", err);
    return null;
  }
}

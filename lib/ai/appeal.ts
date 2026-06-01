// AI-assisted appeal-letter drafting.
//
// Generates a payer-ready first-draft appeal for a denied/underpaid claim. The
// model writes the ARGUMENT (why the denial is wrong, what to cite); a human
// reviews, fills the placeholders, and sends it. Claimtive never auto-sends.
//
// PHI SAFETY: the model receives ONLY non-identifying facts — payer name, CARC
// code/reason, CPT codes, and dollar amounts. Every patient identifier is a
// bracketed PLACEHOLDER ([PATIENT NAME], [MEMBER ID], [DATE OF SERVICE],
// [CLAIM NUMBER]) that the biller merges locally from the claim they can see.
// So nothing PHI ever leaves for the model (stays consistent with the GCP BAA +
// de-identification posture used everywhere else).

import { callModel } from "./vertex";

export interface AppealServiceLine {
  procedureCode: string;
  modifier?: string | null;
  chargeAmount: number;
  paidAmount: number;
  contractedRate?: number | null;
  denialReason?: string | null;
}

export interface AppealClaimInput {
  payerName: string | null;
  primaryDenialCode: string | null;
  primaryDenialReason: string | null;
  isDenied: boolean;
  isUnderpaid: boolean;
  deniedAmount: number;
  underpaidAmount: number;
  services: AppealServiceLine[];
}

const SYSTEM_PROMPT = `You are a medical-billing specialist drafting a formal insurance claim-appeal letter on behalf of a healthcare provider.

Rules:
- Output ONLY the letter text (no preamble, no markdown, no notes).
- Use bracketed PLACEHOLDERS for any information you are not given: [PATIENT NAME], [MEMBER ID], [DATE OF SERVICE], [CLAIM NUMBER], [PROVIDER NAME], [NPI], [DATE]. Do not invent these values.
- Make a specific, professional argument for why the adjudication should be reconsidered, grounded in the denial reason provided:
  - Authorization denials: state that authorization was obtained/was not required and request reprocessing; ask them to cite the specific policy if upholding.
  - Medical-necessity denials: reference that documentation supports medical necessity and offer to provide records / cite the applicable coverage policy.
  - Bundling/coding denials: argue the services were distinct and separately payable (reference modifier where relevant).
  - Timely-filing denials: assert timely submission and request proof-of-timely-filing review.
  - Underpayments: state the contracted/allowed rate vs. the amount paid and request payment of the difference per the participating-provider agreement.
- Be concise (one page), firm, and courteous. Reference the specific CPT codes and dollar figures provided.
- Close by requesting written reconsideration within the plan's appeal timeframe.`;

export function buildAppealUserMessage(input: AppealClaimInput): string {
  const lines = input.services
    .map((s) => {
      const parts = [
        `  - CPT ${s.procedureCode}${s.modifier ? `-${s.modifier}` : ""}`,
        `charged $${s.chargeAmount.toFixed(2)}`,
        `paid $${s.paidAmount.toFixed(2)}`
      ];
      if (s.contractedRate != null)
        parts.push(`contracted rate $${s.contractedRate.toFixed(2)}`);
      if (s.denialReason) parts.push(`denial: ${s.denialReason}`);
      return parts.join(", ");
    })
    .join("\n");

  const kind = input.isDenied
    ? "DENIAL"
    : input.isUnderpaid
      ? "UNDERPAYMENT"
      : "ADJUSTMENT";

  return [
    `Draft an appeal for the following ${kind}.`,
    `Payer: ${input.payerName ?? "[PAYER NAME]"}`,
    input.primaryDenialCode
      ? `Primary denial reason: CARC ${input.primaryDenialCode} — ${input.primaryDenialReason ?? ""}`
      : "",
    input.isDenied
      ? `Denied (recoverable) amount: $${input.deniedAmount.toFixed(2)}`
      : "",
    input.isUnderpaid
      ? `Underpaid below contract by: $${input.underpaidAmount.toFixed(2)}`
      : "",
    "",
    "Service lines:",
    lines,
    "",
    "Remember: use placeholders for all patient/provider identifiers — they are intentionally not provided."
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Generate an appeal-letter draft. Throws AiDisabledError when the AI layer is
 * off (caller surfaces a friendly message). The returned text contains
 * [PLACEHOLDERS] the biller fills in before sending.
 */
export async function generateAppealDraft(
  input: AppealClaimInput
): Promise<string> {
  return callModel({
    system: SYSTEM_PROMPT,
    user: buildAppealUserMessage(input),
    json: false,
    temperature: 0.2,
    maxTokens: 1200
  });
}

// Contract-PDF → structured rate extraction.
//
// Many clinics keep their payer contracts as PDFs (a signed fee-schedule
// exhibit, a scanned amendment) rather than clean CSVs. This module hands the
// PDF to Gemini, which reads it and emits structured CPT → allowed-amount rows.
//
// CRITICAL — human-in-the-loop: the model NEVER writes to the database and the
// extracted rates NEVER touch the underpayment math directly. extractRatesFromPdf
// returns a *preview* that a biller reviews, edits, and explicitly confirms in
// the UI. Only the confirmed rows are persisted (via the same upsert path as a
// CSV upload). The model structures unstructured input; a human approves money.
//
// PHI note: fee schedules are pricing/contract data — CPT codes, dollar amounts,
// payer names — not patient identifiers, so the document is sent to Gemini as-is
// under the GCP BAA. There is nothing to de-identify here.

import { callModelWithPdf } from "../ai/vertex";

export interface ExtractedRate {
  procedureCode: string;
  modifier: string | null;
  allowedAmount: number;
  /** Optional plain-English procedure description, to aid human review. */
  description?: string | null;
}

export interface PdfExtractionResult {
  rates: ExtractedRate[];
  /** The model's best read of which payer the contract is with, if stated. */
  payerName: string | null;
  /** ISO date (YYYY-MM-DD) if an effective date is stated in the document. */
  effectiveDate: string | null;
  /** Non-fatal caveats: skipped rows, ambiguous values, percent-based schedules. */
  warnings: string[];
  /** A short free-text note from the model about the document, if anything is unusual. */
  notes: string | null;
}

const SYSTEM_PROMPT = `You are a careful data-extraction assistant for a healthcare revenue-cycle tool.
You are given a payer contract or fee-schedule PDF. Extract the contracted
reimbursement rates: each row is a procedure code (CPT or HCPCS), an optional
modifier, and the allowed/contracted dollar amount the payer agrees to pay.

Rules:
- Only extract rows that have BOTH a procedure code and a dollar allowed amount.
- Procedure codes are 5-character CPT (e.g. 99213) or HCPCS (e.g. J1100) codes.
- A modifier is a 2-character suffix (e.g. 25, 59, LT, TC). Use null if none.
- allowedAmount is a number in US dollars (no $ sign, no commas).
- If the schedule expresses rates as a percentage of Medicare or another basis
  rather than fixed dollars, do NOT guess dollar values — return an empty rates
  array and explain in "notes".
- Do not invent codes or amounts. If you cannot read a value, omit that row.
- Capture the payer name and contract effective date if clearly stated.

Return ONLY JSON in exactly this shape:
{
  "payerName": string | null,
  "effectiveDate": string | null,   // YYYY-MM-DD or null
  "notes": string | null,
  "rates": [
    { "procedureCode": string, "modifier": string | null, "allowedAmount": number, "description": string | null }
  ]
}`;

const USER_PROMPT =
  "Extract the contracted fee schedule from this document as JSON per the system instructions.";

/** Strip ```json fences and grab the outermost JSON object if the model wrapped it. */
function stripToJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // If there's leading/trailing prose, isolate the outermost {...}.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    if (first !== -1 && last !== -1 && last > first) {
      s = s.slice(first, last + 1);
    }
  }
  return s;
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  // CPT/HCPCS are 5 chars; be lenient but reject obvious non-codes.
  if (!/^[A-Z0-9]{4,7}$/.test(code)) return null;
  return code;
}

function normalizeModifier(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const mod = raw.trim().toUpperCase();
  if (mod === "" || mod === "NULL" || mod === "NONE") return null;
  if (!/^[A-Z0-9]{2}$/.test(mod)) return null; // modifiers are 2 chars
  return mod;
}

function normalizeAmount(raw: unknown): number | null {
  let n: number | null = null;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const cleaned = raw.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    n = Number.isFinite(parsed) ? parsed : null;
  }
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Pure parser/validator for the model's JSON response. Separated from the
 * network call so it can be unit-tested with fixed payloads. Never throws on a
 * bad row — it skips it and records a warning, so a few unreadable lines don't
 * sink the whole extraction.
 */
export function parseExtractionResponse(raw: string): PdfExtractionResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    return {
      rates: [],
      payerName: null,
      effectiveDate: null,
      warnings: ["Could not read the model's response as JSON."],
      notes: null
    };
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawRates = Array.isArray(obj.rates) ? obj.rates : [];
  const payerName =
    typeof obj.payerName === "string" && obj.payerName.trim()
      ? obj.payerName.trim()
      : null;
  const effectiveDate = normalizeDate(obj.effectiveDate);
  const notes =
    typeof obj.notes === "string" && obj.notes.trim() ? obj.notes.trim() : null;

  const rates: ExtractedRate[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const entry of rawRates) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const code = normalizeCode(row.procedureCode);
    const amount = normalizeAmount(row.allowedAmount);
    if (!code || amount === null) {
      skipped++;
      continue;
    }
    const modifier = normalizeModifier(row.modifier);
    const key = `${code}|${modifier ?? ""}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const description =
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null;
    rates.push({ procedureCode: code, modifier, allowedAmount: amount, description });
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} row(s) could not be read (missing/invalid code or amount) and were skipped.`
    );
  }
  const zeros = rates.filter((r) => r.allowedAmount === 0).length;
  if (zeros > 0) {
    warnings.push(
      `${zeros} rate(s) came through as $0.00 — double-check these before confirming.`
    );
  }
  if (rates.length === 0 && !notes) {
    warnings.push("No rates were extracted from this document.");
  }

  return { rates, payerName, effectiveDate, warnings, notes };
}

/**
 * Extract contracted rates from a fee-schedule PDF using Gemini, returning a
 * reviewable preview. Throws AiDisabledError when the AI layer is off (the
 * caller surfaces a friendly "use CSV instead" message).
 */
export async function extractRatesFromPdf(
  pdfBase64: string
): Promise<PdfExtractionResult> {
  const raw = await callModelWithPdf({
    system: SYSTEM_PROMPT,
    user: USER_PROMPT,
    pdfBase64
  });
  return parseExtractionResponse(raw);
}

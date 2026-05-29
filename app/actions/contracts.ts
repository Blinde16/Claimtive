"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseFeeSchedule, type ParsedRate } from "@/lib/contracts/parseFeeSchedule";
import {
  extractRatesFromPdf,
  type ExtractedRate,
  type PdfExtractionResult
} from "@/lib/contracts/extractRatesFromPdf";
import { AiDisabledError } from "@/lib/ai/vertex";
import { recomputeOrgAnalytics } from "@/lib/analytics/recompute";
import { recordAudit } from "@/lib/audit";

/**
 * Re-run the deterministic engine over already-ingested claims so newly loaded
 * rates retroactively surface underpayments. Best-effort: a recompute failure
 * must not fail the rate save (the rates are already persisted).
 */
async function recomputeAfterRateChange(organizationId: string): Promise<void> {
  try {
    await recomputeOrgAnalytics(organizationId);
  } catch (err) {
    console.error("recomputeOrgAnalytics failed after rate change:", err);
  }
}

export interface ContractUploadState {
  error?: string;
  success?: string;
  summary?: {
    payers: number;
    created: number;
    updated: number;
    unchanged: number;
    skippedRows: number;
    rowErrors: string[];
  };
}

const MAX_BYTES = 5 * 1024 * 1024; // fee schedules are small

interface PersistResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Shared upsert path for contracted rates — used by both the CSV import and the
 * (human-confirmed) PDF extraction. Groups rates by payer, find-or-creates the
 * payer + contract, then creates/updates/leaves each rate. Rates are compared by
 * (code, modifier); only a changed allowed amount triggers an update.
 */
async function persistRates(
  organizationId: string,
  rates: ParsedRate[],
  opts: { providedName?: string; effectiveDate?: Date | null } = {}
): Promise<PersistResult> {
  const byPayer = new Map<string, ParsedRate[]>();
  for (const rate of rates) {
    const list = byPayer.get(rate.payerName) ?? [];
    list.push(rate);
    byPayer.set(rate.payerName, list);
  }
  const multiPayer = byPayer.size > 1;

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const [payerName, payerRates] of byPayer) {
        const payer = await tx.payer.upsert({
          where: { organizationId_name: { organizationId, name: payerName } },
          update: {},
          create: { organizationId, name: payerName }
        });

        const contractName =
          !multiPayer && opts.providedName
            ? opts.providedName
            : `${payerName} Fee Schedule`;

        let contract = await tx.contract.findFirst({
          where: { organizationId, payerId: payer.id, name: contractName },
          select: { id: true }
        });
        if (!contract) {
          contract = await tx.contract.create({
            data: {
              organizationId,
              payerId: payer.id,
              name: contractName,
              effectiveDate: opts.effectiveDate ?? null
            },
            select: { id: true }
          });
        } else if (opts.effectiveDate) {
          await tx.contract.update({
            where: { id: contract.id },
            data: { effectiveDate: opts.effectiveDate }
          });
        }

        const existing = await tx.contractRate.findMany({
          where: { contractId: contract.id },
          select: { id: true, procedureCode: true, modifier: true, allowedAmount: true }
        });
        const key = (code: string, mod: string | null) => `${code}|${mod ?? ""}`;
        const existingMap = new Map(existing.map((e) => [key(e.procedureCode, e.modifier), e]));

        const toCreate: Prisma.ContractRateCreateManyInput[] = [];
        for (const rate of payerRates) {
          const ex = existingMap.get(key(rate.procedureCode, rate.modifier));
          if (!ex) {
            toCreate.push({
              contractId: contract.id,
              procedureCode: rate.procedureCode,
              modifier: rate.modifier,
              allowedAmount: rate.allowedAmount
            });
            created++;
          } else if (Number(ex.allowedAmount) !== rate.allowedAmount) {
            await tx.contractRate.update({
              where: { id: ex.id },
              data: { allowedAmount: rate.allowedAmount }
            });
            updated++;
          } else {
            unchanged++;
          }
        }
        if (toCreate.length > 0) {
          await tx.contractRate.createMany({ data: toCreate });
        }
      }
    },
    { timeout: 30000 }
  );

  return { created, updated, unchanged };
}

export async function uploadFeeSchedule(
  _prev: ContractUploadState,
  formData: FormData
): Promise<ContractUploadState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to upload contracts." };

  const file = formData.get("file");
  const defaultPayer = (formData.get("payer") as string | null)?.trim() || undefined;
  const providedName = (formData.get("contractName") as string | null)?.trim() || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV fee-schedule file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the 5 MB limit." };
  }

  const text = await file.text();
  const parsed = parseFeeSchedule(text, { defaultPayer });

  // Header-level errors (missing columns / no payer) mean nothing imported.
  if (parsed.rates.length === 0) {
    return {
      error:
        parsed.errors[0]?.message ??
        "No valid rates found. Check that the file has procedure-code and allowed-amount columns.",
      summary: {
        payers: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        skippedRows: parsed.errors.length,
        rowErrors: parsed.errors.slice(0, 10).map((e) => `Line ${e.line}: ${e.message}`)
      }
    };
  }

  // Distinct payers in the file (for the success summary).
  const distinctPayers = new Set(parsed.rates.map((r) => r.payerName)).size;

  let result: PersistResult;
  try {
    result = await persistRates(user.organizationId, parsed.rates, { providedName });
  } catch (err) {
    console.error("uploadFeeSchedule failed:", err);
    return { error: "Failed to save contracts. Please try again." };
  }

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "contract.upload",
    detail: `${result.created} new, ${result.updated} updated rates across ${distinctPayers} payer(s) (CSV)`
  });

  // Re-run the engine so the new rates retroactively surface underpayments on
  // claims that were imported before the contract existed.
  await recomputeAfterRateChange(user.organizationId);

  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath("/uploads");

  return {
    success: `Imported ${result.created} new rate(s), updated ${result.updated}, ${result.unchanged} unchanged across ${distinctPayers} payer(s).`,
    summary: {
      payers: distinctPayers,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skippedRows: parsed.errors.length,
      rowErrors: parsed.errors.slice(0, 10).map((e) => `Line ${e.line}: ${e.message}`)
    }
  };
}

// ── Contract-PDF extraction (Gemini) ────────────────────────────────────────
// Two-step, human-in-the-loop flow:
//   1. extractFeeSchedulePdf — Gemini reads the PDF, returns a reviewable preview.
//      Nothing is written to the database. Rates do NOT affect any math yet.
//   2. confirmExtractedRates — the biller submits the reviewed (possibly edited)
//      rows, which are persisted via the same upsert path as a CSV import.

export interface PdfExtractState {
  error?: string;
  preview?: PdfExtractionResult & { fileName: string };
}

export async function extractFeeSchedulePdf(
  _prev: PdfExtractState,
  formData: FormData
): Promise<PdfExtractState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to upload contracts." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF fee-schedule file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the 5 MB limit." };
  }
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return { error: "That doesn't look like a PDF. Upload a PDF, or use the CSV importer." };
  }

  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let preview: PdfExtractionResult;
  try {
    preview = await extractRatesFromPdf(pdfBase64);
  } catch (err) {
    if (err instanceof AiDisabledError) {
      return {
        error:
          "AI extraction isn't enabled on this environment. Use the CSV importer instead."
      };
    }
    console.error("extractFeeSchedulePdf failed:", err);
    return {
      error:
        "Could not extract rates from this PDF. Please try again, or use the CSV importer."
    };
  }

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "contract.pdf_extract",
    detail: `Extracted ${preview.rates.length} candidate rate(s) from "${file.name}" for review`
  });

  return { preview: { ...preview, fileName: file.name } };
}

export interface ConfirmRatesState {
  error?: string;
  success?: string;
  summary?: { created: number; updated: number; unchanged: number };
}

export async function confirmExtractedRates(
  _prev: ConfirmRatesState,
  formData: FormData
): Promise<ConfirmRatesState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to save contracts." };

  const payerName = (formData.get("payer") as string | null)?.trim();
  const contractName = (formData.get("contractName") as string | null)?.trim() || undefined;
  const effectiveRaw = (formData.get("effectiveDate") as string | null)?.trim();
  const ratesJson = formData.get("rates") as string | null;

  if (!payerName) {
    return { error: "Enter the payer name these rates belong to." };
  }
  if (!ratesJson) {
    return { error: "No rates to save." };
  }

  let extracted: ExtractedRate[];
  try {
    const parsed = JSON.parse(ratesJson);
    extracted = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "Could not read the reviewed rates. Please try again." };
  }

  // Re-validate every row server-side — never trust the client payload.
  const rates: ParsedRate[] = [];
  const seen = new Set<string>();
  for (const row of extracted) {
    const code = String(row?.procedureCode ?? "").trim().toUpperCase();
    const amount = Number(row?.allowedAmount);
    if (!code || !Number.isFinite(amount) || amount < 0) continue;
    const modRaw = String(row?.modifier ?? "").trim().toUpperCase();
    const modifier = modRaw && modRaw !== "NULL" ? modRaw : null;
    const key = `${code}|${modifier ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({
      payerName,
      procedureCode: code,
      modifier,
      allowedAmount: Math.round((amount + Number.EPSILON) * 100) / 100
    });
  }

  if (rates.length === 0) {
    return { error: "No valid rates to save after review." };
  }

  const effectiveDate =
    effectiveRaw && /^\d{4}-\d{2}-\d{2}$/.test(effectiveRaw)
      ? new Date(`${effectiveRaw}T00:00:00Z`)
      : null;

  let result: PersistResult;
  try {
    result = await persistRates(user.organizationId, rates, {
      providedName: contractName,
      effectiveDate
    });
  } catch (err) {
    console.error("confirmExtractedRates failed:", err);
    return { error: "Failed to save contracts. Please try again." };
  }

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "contract.pdf_confirm",
    detail: `${result.created} new, ${result.updated} updated rates for ${payerName} (PDF, human-confirmed)`
  });

  // Retroactively surface underpayments on existing claims with the new rates.
  await recomputeAfterRateChange(user.organizationId);

  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath("/uploads");

  return {
    success: `Saved ${result.created} new rate(s), updated ${result.updated}, ${result.unchanged} unchanged for ${payerName}.`,
    summary: { created: result.created, updated: result.updated, unchanged: result.unchanged }
  };
}

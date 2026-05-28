"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseFeeSchedule, type ParsedRate } from "@/lib/contracts/parseFeeSchedule";

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

  // Group parsed rates by payer name.
  const byPayer = new Map<string, ParsedRate[]>();
  for (const rate of parsed.rates) {
    const list = byPayer.get(rate.payerName) ?? [];
    list.push(rate);
    byPayer.set(rate.payerName, list);
  }
  const multiPayer = byPayer.size > 1;

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const [payerName, rates] of byPayer) {
          // Find-or-create the payer (unique on [organizationId, name]).
          const payer = await tx.payer.upsert({
            where: {
              organizationId_name: { organizationId: user.organizationId, name: payerName }
            },
            update: {},
            create: { organizationId: user.organizationId, name: payerName }
          });

          const contractName =
            !multiPayer && providedName ? providedName : `${payerName} Fee Schedule`;

          // Find-or-create the contract for this payer + name.
          let contract = await tx.contract.findFirst({
            where: {
              organizationId: user.organizationId,
              payerId: payer.id,
              name: contractName
            },
            select: { id: true }
          });
          if (!contract) {
            contract = await tx.contract.create({
              data: {
                organizationId: user.organizationId,
                payerId: payer.id,
                name: contractName
              },
              select: { id: true }
            });
          }

          // Load existing rates once; decide create vs update vs unchanged.
          const existing = await tx.contractRate.findMany({
            where: { contractId: contract.id },
            select: { id: true, procedureCode: true, modifier: true, allowedAmount: true }
          });
          const key = (code: string, mod: string | null) => `${code}|${mod ?? ""}`;
          const existingMap = new Map(existing.map((e) => [key(e.procedureCode, e.modifier), e]));

          const toCreate: Prisma.ContractRateCreateManyInput[] = [];
          for (const rate of rates) {
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
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Failed to save contracts: ${err.message}` : "Failed to save contracts."
    };
  }

  revalidatePath("/contracts");
  // Underpayment numbers are computed at ingest time, so changing rates does not
  // retroactively update already-imported claims — but new uploads will use them.
  revalidatePath("/dashboard");

  return {
    success: `Imported ${created} new rate(s), updated ${updated}, ${unchanged} unchanged across ${byPayer.size} payer(s).`,
    summary: {
      payers: byPayer.size,
      created,
      updated,
      unchanged,
      skippedRows: parsed.errors.length,
      rowErrors: parsed.errors.slice(0, 10).map((e) => `Line ${e.line}: ${e.message}`)
    }
  };
}

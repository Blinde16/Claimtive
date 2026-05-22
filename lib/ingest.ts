import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { analyzeClaim, ContractRateLookup } from "./analytics/denials";
import { parse835 } from "./edi/parse835";
import { parse837 } from "./edi/parse837";
import { detectTransactionType, tokenize } from "./edi/tokenizer";

export interface IngestInput {
  organizationId: string;
  uploadedById?: string | null;
  fileName: string;
  content: string;
}

export interface IngestResult {
  ediFileId: string;
  type: "X835" | "X837";
  claimCount: number;
  totalCharged: number;
  totalPaid: number;
  totalDenied: number;
  totalUnderpaid: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function buildRateLookup(
  organizationId: string
): Promise<ContractRateLookup> {
  const rates = await prisma.contractRate.findMany({
    where: { contract: { organizationId } },
    select: { procedureCode: true, modifier: true, allowedAmount: true }
  });
  const map = new Map<string, number>();
  for (const r of rates) {
    const amount = Number(r.allowedAmount);
    map.set(`${r.procedureCode}|${r.modifier ?? ""}`, amount);
    if (!map.has(r.procedureCode)) map.set(r.procedureCode, amount);
  }
  return (code, modifier) => {
    if (modifier) {
      const exact = map.get(`${code}|${modifier}`);
      if (exact !== undefined) return exact;
    }
    const base = map.get(`${code}|`);
    if (base !== undefined) return base;
    return map.get(code);
  };
}

async function resolvePayerId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name?: string,
  externalId?: string
): Promise<string | null> {
  if (!name) return null;
  const payer = await tx.payer.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: externalId ? { externalId } : {},
    create: { organizationId, name, externalId }
  });
  return payer.id;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ingest835(input: IngestInput): Promise<IngestResult> {
  const parsed = parse835(input.content);
  const rateLookup = await buildRateLookup(input.organizationId);

  return prisma.$transaction(
    async (tx) => {
      const payerId = await resolvePayerId(
        tx,
        input.organizationId,
        parsed.payerName,
        parsed.payerId
      );

      const ediFile = await tx.ediFile.create({
        data: {
          organizationId: input.organizationId,
          uploadedById: input.uploadedById ?? null,
          fileName: input.fileName,
          type: "X835",
          status: "PENDING",
          controlNumber: parsed.controlNumber,
          byteSize: Buffer.byteLength(input.content, "utf8")
        }
      });

      let totalCharged = 0;
      let totalPaid = 0;
      let totalDenied = 0;
      let totalUnderpaid = 0;

      for (const claim of parsed.claims) {
        const analysis = analyzeClaim(claim, rateLookup);
        totalCharged = round2(totalCharged + claim.totalCharge);
        totalPaid = round2(totalPaid + claim.totalPaid);
        totalDenied = round2(totalDenied + analysis.deniedAmount);
        totalUnderpaid = round2(totalUnderpaid + analysis.underpaidAmount);

        await tx.claim.create({
          data: {
            organizationId: input.organizationId,
            ediFileId: ediFile.id,
            payerId,
            payerName: parsed.payerName,
            patientControlNumber: claim.patientControlNumber,
            payerClaimControlNumber: claim.payerClaimControlNumber,
            statusCode: claim.statusCode,
            statusLabel: analysis.statusLabel,
            filingIndicator: claim.filingIndicator,
            renderingProviderNpi: claim.renderingProviderNpi,
            patientName: claim.patientName,
            serviceDate: toDate(claim.serviceDate),
            paidDate: toDate(parsed.paidDate),
            totalCharge: claim.totalCharge,
            totalPaid: claim.totalPaid,
            patientResponsibility: claim.patientResponsibility,
            deniedAmount: analysis.deniedAmount,
            underpaidAmount: analysis.underpaidAmount,
            isDenied: analysis.isDenied,
            isUnderpaid: analysis.isUnderpaid,
            primaryDenialCode: analysis.primaryDenialCode,
            primaryDenialReason: analysis.primaryDenialReason,
            adjustments: {
              create: claim.adjustments.map((a) => ({
                level: "CLAIM" as const,
                groupCode: a.groupCode,
                reasonCode: a.reasonCode,
                amount: a.amount,
                quantity: a.quantity ?? null
              }))
            },
            serviceLines: {
              create: claim.serviceLines.map((line, i) => {
                const s = analysis.services[i];
                return {
                  procedureCode: line.procedureCode,
                  modifier: line.modifier,
                  revenueCode: line.revenueCode,
                  units: line.units,
                  serviceDate: toDate(line.serviceDate),
                  chargeAmount: line.chargeAmount,
                  paidAmount: line.paidAmount,
                  allowedAmount: s.allowedAmount,
                  contractedRate: s.contractedRate ?? null,
                  underpaidAmount: s.underpaidAmount,
                  deniedAmount: s.deniedAmount,
                  isDenied: s.isDenied,
                  isUnderpaid: s.isUnderpaid,
                  denialCode: s.denialCode,
                  denialReason: s.denialReason,
                  remarkCodes: line.remarkCodes,
                  adjustments: {
                    create: line.adjustments.map((a) => ({
                      level: "SERVICE" as const,
                      groupCode: a.groupCode,
                      reasonCode: a.reasonCode,
                      amount: a.amount,
                      quantity: a.quantity ?? null
                    }))
                  }
                };
              })
            }
          }
        });
      }

      await tx.ediFile.update({
        where: { id: ediFile.id },
        data: {
          status: "PROCESSED",
          claimCount: parsed.claims.length,
          totalCharged,
          totalPaid,
          totalDenied,
          totalUnderpaid
        }
      });

      return {
        ediFileId: ediFile.id,
        type: "X835" as const,
        claimCount: parsed.claims.length,
        totalCharged,
        totalPaid,
        totalDenied,
        totalUnderpaid
      };
    },
    { timeout: 30000 }
  );
}

async function ingest837(input: IngestInput): Promise<IngestResult> {
  const parsed = parse837(input.content);
  const rateLookup = await buildRateLookup(input.organizationId);

  return prisma.$transaction(
    async (tx) => {
      const payerId = await resolvePayerId(
        tx,
        input.organizationId,
        parsed.payerName
      );

      const ediFile = await tx.ediFile.create({
        data: {
          organizationId: input.organizationId,
          uploadedById: input.uploadedById ?? null,
          fileName: input.fileName,
          type: "X837",
          status: "PENDING",
          controlNumber: parsed.controlNumber,
          byteSize: Buffer.byteLength(input.content, "utf8")
        }
      });

      let totalCharged = 0;

      for (const claim of parsed.claims) {
        totalCharged = round2(totalCharged + claim.totalCharge);
        await tx.claim.create({
          data: {
            organizationId: input.organizationId,
            ediFileId: ediFile.id,
            payerId,
            payerName: parsed.payerName,
            patientControlNumber: claim.patientControlNumber,
            patientName: claim.patientName,
            renderingProviderNpi:
              claim.renderingProviderNpi ?? parsed.billingProviderNpi,
            statusLabel: "Submitted (awaiting remittance)",
            totalCharge: claim.totalCharge,
            serviceLines: {
              create: claim.serviceLines.map((line) => ({
                procedureCode: line.procedureCode,
                modifier: line.modifier,
                units: line.units,
                serviceDate: toDate(line.serviceDate),
                chargeAmount: line.chargeAmount,
                contractedRate: rateLookup(line.procedureCode, line.modifier) ?? null
              }))
            }
          }
        });
      }

      await tx.ediFile.update({
        where: { id: ediFile.id },
        data: {
          status: "PROCESSED",
          claimCount: parsed.claims.length,
          totalCharged
        }
      });

      return {
        ediFileId: ediFile.id,
        type: "X837" as const,
        claimCount: parsed.claims.length,
        totalCharged,
        totalPaid: 0,
        totalDenied: 0,
        totalUnderpaid: 0
      };
    },
    { timeout: 30000 }
  );
}

export async function ingestEdiFile(input: IngestInput): Promise<IngestResult> {
  const type = detectTransactionType(tokenize(input.content));
  if (type === "X835") return ingest835(input);
  if (type === "X837") return ingest837(input);
  throw new Error(
    "Unrecognized EDI file. Expected an X12 835 (remittance) or 837 (claim)."
  );
}

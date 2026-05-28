import type { Prisma } from "@prisma/client";
import { isWorkStatus } from "./worklist";

export type ClaimFilter = "all" | "denied" | "underpaid" | "clean";

export const CLAIM_FILTERS: { key: ClaimFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "denied", label: "Denied" },
  { key: "underpaid", label: "Underpaid" },
  { key: "clean", label: "Clean" }
];

export function normalizeFilter(value: string | undefined): ClaimFilter {
  return CLAIM_FILTERS.find((f) => f.key === value)?.key ?? "all";
}

/** Shared WHERE builder used by both the claims list page and the CSV export. */
export function buildClaimWhere(
  organizationId: string,
  params: { filter?: string; q?: string; status?: string }
): Prisma.ClaimWhereInput {
  const where: Prisma.ClaimWhereInput = { organizationId };

  const filter = normalizeFilter(params.filter);
  if (filter === "denied") where.isDenied = true;
  else if (filter === "underpaid") where.isUnderpaid = true;
  else if (filter === "clean") {
    where.isDenied = false;
    where.isUnderpaid = false;
    where.ediFile = { type: "X835" };
  }

  if (params.status && isWorkStatus(params.status)) {
    where.workStatus = params.status;
  }

  const q = (params.q ?? "").trim();
  if (q) {
    where.OR = [
      { patientControlNumber: { contains: q, mode: "insensitive" } },
      { patientName: { contains: q, mode: "insensitive" } },
      { payerClaimControlNumber: { contains: q, mode: "insensitive" } }
    ];
  }

  return where;
}

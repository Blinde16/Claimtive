import { ParsedAdjustment, ParsedClaim, ParsedServiceLine } from "../edi/types";
import { classifyAdjustment, claimStatusLabel } from "./carc";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Per-unit contracted allowed amount for a procedure under a specific payer's
 * contract, or undefined if none. Payer-scoped so the correct rate is applied
 * even when a clinic has different contracted rates per payer for the same code.
 */
export type ContractRateLookup = (
  payerId: string | null,
  procedureCode: string,
  modifier?: string
) => number | undefined;

export interface ServiceAnalysis {
  allowedAmount: number;
  contractedRate?: number;
  underpaidAmount: number;
  deniedAmount: number;
  isDenied: boolean;
  isUnderpaid: boolean;
  denialCode?: string;
  denialReason?: string;
}

export interface ClaimAnalysis {
  statusLabel?: string;
  deniedAmount: number;
  underpaidAmount: number;
  isDenied: boolean;
  isUnderpaid: boolean;
  primaryDenialCode?: string;
  primaryDenialReason?: string;
  services: ServiceAnalysis[];
}

function sumActionable(adjustments: ParsedAdjustment[]): number {
  let total = 0;
  for (const adj of adjustments) {
    if (classifyAdjustment(adj.groupCode, adj.reasonCode).actionable) {
      total += adj.amount;
    }
  }
  return round2(total);
}

function sumGroup(adjustments: ParsedAdjustment[], groupCode: string): number {
  let total = 0;
  for (const adj of adjustments) {
    if (adj.groupCode === groupCode) total += adj.amount;
  }
  return round2(total);
}

/**
 * Sums only the *non-actionable* CO (contractual obligation) adjustments — the
 * genuine write-offs the payer is contractually entitled to (e.g. CO-45 charge
 * exceeds fee schedule). Actionable CO reductions (e.g. CO-97 bundling) are
 * deliberately excluded: those dollars are recoverable and already captured in
 * `deniedAmount`, so they must NOT also depress the underpayment baseline.
 */
function sumNonActionableContractual(adjustments: ParsedAdjustment[]): number {
  let total = 0;
  for (const adj of adjustments) {
    if (adj.groupCode !== "CO") continue;
    if (classifyAdjustment(adj.groupCode, adj.reasonCode).actionable) continue;
    total += adj.amount;
  }
  return round2(total);
}

/** Largest actionable adjustment, used to attribute a primary denial reason. */
function dominantActionable(
  adjustments: ParsedAdjustment[]
): { code: string; reason: string } | undefined {
  let best: { code: string; reason: string; amount: number } | undefined;
  for (const adj of adjustments) {
    const cls = classifyAdjustment(adj.groupCode, adj.reasonCode);
    if (!cls.actionable) continue;
    if (!best || adj.amount > best.amount) {
      best = { code: adj.reasonCode, reason: cls.description, amount: adj.amount };
    }
  }
  return best ? { code: best.code, reason: best.reason } : undefined;
}

export function analyzeServiceLine(
  line: ParsedServiceLine,
  rateLookup?: ContractRateLookup,
  payerId: string | null = null
): ServiceAnalysis {
  // Allowed (for display) = billed minus ALL contractual obligations the payer
  // applied. This mirrors the remittance's stated allowed amount.
  const contractual = sumGroup(line.adjustments, "CO");
  const allowedAmount = round2(Math.max(0, line.chargeAmount - contractual));
  const deniedAmount = sumActionable(line.adjustments);
  const isDenied = line.paidAmount === 0 && deniedAmount > 0 && line.chargeAmount > 0;

  let contractedRate: number | undefined;
  let underpaidAmount = 0;
  if (rateLookup) {
    const rate = rateLookup(payerId, line.procedureCode, line.modifier);
    if (rate !== undefined) {
      contractedRate = rate;
      if (!isDenied) {
        const units = line.units > 0 ? line.units : 1;
        const expected = round2(rate * units);
        // Underpayment is measured against only the LEGITIMATE contractual
        // write-offs (non-actionable CO). Actionable CO reductions like CO-97
        // bundling are recoverable dollars already counted in `deniedAmount`;
        // subtracting them here too would double-count the same money in the
        // dashboard's "recoverable = denied + underpaid".
        const nonActionableContractual = sumNonActionableContractual(
          line.adjustments
        );
        const expectedAllowed = round2(
          Math.max(0, line.chargeAmount - nonActionableContractual)
        );
        underpaidAmount = round2(Math.max(0, expected - expectedAllowed));
      }
    }
  }

  const dominant = isDenied ? dominantActionable(line.adjustments) : undefined;

  return {
    allowedAmount,
    contractedRate,
    underpaidAmount,
    deniedAmount,
    isDenied,
    isUnderpaid: underpaidAmount >= 0.01,
    denialCode: dominant?.code,
    denialReason: dominant?.reason
  };
}

export function analyzeClaim(
  claim: ParsedClaim,
  rateLookup?: ContractRateLookup,
  payerId: string | null = null
): ClaimAnalysis {
  const services = claim.serviceLines.map((line) =>
    analyzeServiceLine(line, rateLookup, payerId)
  );

  const serviceDenied = round2(
    services.reduce((sum, s) => sum + s.deniedAmount, 0)
  );
  const claimLevelDenied = sumActionable(claim.adjustments);
  const deniedAmount = round2(serviceDenied + claimLevelDenied);

  const underpaidAmount = round2(
    services.reduce((sum, s) => sum + s.underpaidAmount, 0)
  );

  const statusDenied = claim.statusCode === "4";
  const lineDenied = services.some((s) => s.isDenied);
  const fullyUnpaidWithReason =
    claim.totalPaid === 0 && claim.totalCharge > 0 && claimLevelDenied > 0;
  const isDenied = statusDenied || lineDenied || fullyUnpaidWithReason;

  // Attribute a primary reason from all actionable adjustments on the claim.
  const allAdjustments: ParsedAdjustment[] = [
    ...claim.adjustments,
    ...claim.serviceLines.flatMap((l) => l.adjustments)
  ];
  const dominant = isDenied ? dominantActionable(allAdjustments) : undefined;

  return {
    statusLabel: claimStatusLabel(claim.statusCode),
    deniedAmount,
    underpaidAmount,
    isDenied,
    isUnderpaid: underpaidAmount >= 0.01,
    primaryDenialCode: dominant?.code,
    primaryDenialReason: dominant?.reason,
    services
  };
}

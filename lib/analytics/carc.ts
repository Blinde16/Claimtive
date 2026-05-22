// Reference data for interpreting X12 835 adjudication codes.
//
// CARC = Claim Adjustment Reason Code (CAS segment reason)
// RARC = Remittance Advice Remark Code (LQ/HE segment)
// Group codes describe who bears an adjustment.

export type DenialCategory =
  | "Patient Responsibility"
  | "Contractual"
  | "Informational"
  | "Authorization"
  | "Eligibility"
  | "Coding"
  | "Medical Necessity"
  | "Missing Information"
  | "Timely Filing"
  | "Duplicate"
  | "Coordination of Benefits"
  | "Non-Covered"
  | "Bundling"
  | "Documentation"
  | "Frequency"
  | "Other";

// Categories that represent expected write-offs or money owed elsewhere — not a
// recoverable payer denial.
const NON_ACTIONABLE: ReadonlySet<DenialCategory> = new Set([
  "Patient Responsibility",
  "Contractual",
  "Informational"
]);

export interface CarcEntry {
  description: string;
  category: DenialCategory;
}

export const GROUP_CODES: Record<string, string> = {
  CO: "Contractual Obligation",
  PR: "Patient Responsibility",
  OA: "Other Adjustment",
  PI: "Payer Initiated Reduction",
  CR: "Correction and Reversal"
};

export const CARC_CODES: Record<string, CarcEntry> = {
  "1": { description: "Deductible amount", category: "Patient Responsibility" },
  "2": { description: "Coinsurance amount", category: "Patient Responsibility" },
  "3": { description: "Co-payment amount", category: "Patient Responsibility" },
  "4": {
    description: "Procedure code inconsistent with the modifier used",
    category: "Coding"
  },
  "11": {
    description: "Diagnosis inconsistent with the procedure",
    category: "Coding"
  },
  "16": {
    description: "Claim/service lacks information or has a billing error",
    category: "Missing Information"
  },
  "18": {
    description: "Exact duplicate claim or service",
    category: "Duplicate"
  },
  "22": {
    description: "May be covered by another payer per coordination of benefits",
    category: "Coordination of Benefits"
  },
  "23": {
    description: "Impact of prior payer(s) adjudication",
    category: "Informational"
  },
  "24": {
    description: "Charges covered under a capitation agreement",
    category: "Contractual"
  },
  "26": {
    description: "Expenses incurred prior to coverage",
    category: "Eligibility"
  },
  "27": {
    description: "Expenses incurred after coverage terminated",
    category: "Eligibility"
  },
  "29": {
    description: "Time limit for filing has expired",
    category: "Timely Filing"
  },
  "45": {
    description: "Charge exceeds fee schedule/contracted maximum",
    category: "Contractual"
  },
  "49": {
    description: "Non-covered routine/preventive service",
    category: "Non-Covered"
  },
  "50": {
    description: "Not deemed a medical necessity by the payer",
    category: "Medical Necessity"
  },
  "59": {
    description: "Adjusted per multiple/concurrent procedure rules",
    category: "Contractual"
  },
  "96": { description: "Non-covered charge(s)", category: "Non-Covered" },
  "97": {
    description: "Benefit included in another adjudicated service (bundling)",
    category: "Bundling"
  },
  "100": {
    description: "Payment made to patient/insured/responsible party",
    category: "Informational"
  },
  "109": {
    description: "Claim not covered by this payer/contractor",
    category: "Coordination of Benefits"
  },
  "119": {
    description: "Benefit maximum for this period has been reached",
    category: "Non-Covered"
  },
  "131": {
    description: "Claim-specific negotiated discount",
    category: "Contractual"
  },
  "151": {
    description: "Information does not support this many/frequency of services",
    category: "Frequency"
  },
  "197": {
    description: "Precertification/authorization/notification absent",
    category: "Authorization"
  },
  "198": {
    description: "Precertification/authorization exceeded",
    category: "Authorization"
  },
  "204": {
    description: "Service not covered under the patient's current benefit plan",
    category: "Non-Covered"
  },
  "252": {
    description: "Attachment/documentation required to adjudicate",
    category: "Documentation"
  },
  "253": {
    description: "Sequestration — federal payment reduction",
    category: "Contractual"
  }
};

export const RARC_CODES: Record<string, string> = {
  N130: "Consult plan benefit documents for information about restrictions",
  N115: "Decision based on a Local Coverage Determination (LCD)",
  M127: "Missing patient medical record for this service",
  MA04: "Secondary payment cannot be considered without the primary EOB",
  N30: "Patient ineligible for this service",
  N290: "Missing/incomplete/invalid rendering provider identifier",
  N522: "Duplicate of a claim processed or in process as a crossover"
};

export interface AdjustmentClassification {
  groupCode: string;
  groupLabel: string;
  reasonCode: string;
  description: string;
  category: DenialCategory;
  /** True when the adjustment is a recoverable denial/reduction worth working. */
  actionable: boolean;
}

export function classifyAdjustment(
  groupCode: string,
  reasonCode: string
): AdjustmentClassification {
  const entry = CARC_CODES[reasonCode];
  let category: DenialCategory = entry?.category ?? "Other";
  const description =
    entry?.description ?? `Adjustment reason code ${reasonCode}`;

  // Group code can override the category for ambiguous reason codes.
  if (groupCode === "PR") category = "Patient Responsibility";
  else if (groupCode === "CR") category = "Informational";

  const actionable = !NON_ACTIONABLE.has(category);

  return {
    groupCode,
    groupLabel: GROUP_CODES[groupCode] ?? groupCode,
    reasonCode,
    description,
    category,
    actionable
  };
}

export function describeRemark(code: string): string {
  return RARC_CODES[code] ?? `Remark code ${code}`;
}

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  "1": "Processed as primary",
  "2": "Processed as secondary",
  "3": "Processed as tertiary",
  "4": "Denied",
  "19": "Processed as primary, forwarded",
  "20": "Processed as secondary, forwarded",
  "21": "Processed as tertiary, forwarded",
  "22": "Reversal of previous payment",
  "23": "Not our claim, forwarded",
  "25": "Predetermination pricing only"
};

export function claimStatusLabel(statusCode: string | undefined): string | undefined {
  if (!statusCode) return undefined;
  return CLAIM_STATUS_LABELS[statusCode] ?? `Status ${statusCode}`;
}

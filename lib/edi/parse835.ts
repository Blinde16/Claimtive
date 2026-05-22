import {
  EdiDelimiters,
  EdiSegment,
  splitComponents,
  tokenize
} from "./tokenizer";
import {
  Parsed835,
  ParsedAdjustment,
  ParsedClaim,
  ParsedServiceLine
} from "./types";

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Convert an X12 CCYYMMDD date element to an ISO date string. */
function ediDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Date ranges arrive as CCYYMMDD-CCYYMMDD; keep the start.
  const start = value.split("-")[0].trim();
  if (!/^\d{8}$/.test(start)) return undefined;
  return `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
}

/** Parse a CAS segment into 1..6 adjustment triplets. */
function parseCas(
  segment: EdiSegment,
  level: "CLAIM" | "SERVICE"
): ParsedAdjustment[] {
  const groupCode = segment.elements[0]?.trim();
  if (!groupCode) return [];
  const adjustments: ParsedAdjustment[] = [];
  // Element layout: group, [reason, amount, qty] x up to 6.
  for (let i = 1; i < segment.elements.length; i += 3) {
    const reasonCode = segment.elements[i]?.trim();
    const amount = segment.elements[i + 1];
    const quantity = segment.elements[i + 2];
    if (!reasonCode) continue;
    adjustments.push({
      level,
      groupCode,
      reasonCode,
      amount: round2(num(amount)),
      quantity: quantity ? num(quantity) : undefined
    });
  }
  return adjustments;
}

function parseSvc(
  segment: EdiSegment,
  delimiters: EdiDelimiters
): ParsedServiceLine {
  const composite = splitComponents(segment.elements[0], delimiters);
  // SVC01 = qualifier:procedure:mod1:mod2:mod3:mod4 (qualifier e.g. HC/AD/NU).
  const procedureCode = composite[1]?.trim() ?? composite[0]?.trim() ?? "";
  const modifier = composite[2]?.trim() || undefined;
  return {
    procedureCode,
    modifier,
    chargeAmount: round2(num(segment.elements[1])),
    paidAmount: round2(num(segment.elements[2])),
    revenueCode: segment.elements[3]?.trim() || undefined,
    units: segment.elements[4] ? num(segment.elements[4]) : 1,
    serviceDate: undefined,
    adjustments: [],
    remarkCodes: []
  };
}

export function parse835(raw: string): Parsed835 {
  const tokenized = tokenize(raw);
  const { delimiters, segments } = tokenized;

  const result: Parsed835 = {
    type: "X835",
    totalPaid: 0,
    claims: []
  };

  let currentClaim: ParsedClaim | null = null;
  let currentService: ParsedServiceLine | null = null;
  // Tracks whether we are inside a service loop, to route CAS/DTM correctly.
  let inServiceLoop = false;

  const finishService = () => {
    if (currentClaim && currentService) {
      currentClaim.serviceLines.push(currentService);
    }
    currentService = null;
  };

  const finishClaim = () => {
    finishService();
    if (currentClaim) {
      result.claims.push(currentClaim);
    }
    currentClaim = null;
    inServiceLoop = false;
  };

  for (const segment of segments) {
    const { id, elements } = segment;

    switch (id) {
      case "ST": {
        result.controlNumber = elements[1]?.trim();
        break;
      }
      case "BPR": {
        // BPR02 = total actual provider payment amount.
        result.totalPaid = round2(num(elements[1]));
        break;
      }
      case "TRN": {
        result.checkNumber = elements[1]?.trim();
        break;
      }
      case "N1": {
        const entity = elements[0]?.trim();
        if (entity === "PR") {
          result.payerName = elements[1]?.trim();
          // N104 carries the payer identifier when present.
          result.payerId = elements[3]?.trim() || undefined;
        }
        break;
      }
      case "CLP": {
        finishClaim();
        currentClaim = {
          patientControlNumber: elements[0]?.trim() || undefined,
          statusCode: elements[1]?.trim() || undefined,
          totalCharge: round2(num(elements[2])),
          totalPaid: round2(num(elements[3])),
          patientResponsibility: round2(num(elements[4])),
          filingIndicator: elements[5]?.trim() || undefined,
          payerClaimControlNumber: elements[6]?.trim() || undefined,
          adjustments: [],
          serviceLines: []
        };
        inServiceLoop = false;
        break;
      }
      case "CAS": {
        if (!currentClaim) break;
        const adjustments = parseCas(
          segment,
          inServiceLoop ? "SERVICE" : "CLAIM"
        );
        if (inServiceLoop && currentService) {
          currentService.adjustments.push(...adjustments);
        } else {
          currentClaim.adjustments.push(...adjustments);
        }
        break;
      }
      case "NM1": {
        if (!currentClaim) break;
        const entity = elements[0]?.trim();
        if (entity === "QC") {
          // Patient: last*first
          const last = elements[2]?.trim() ?? "";
          const first = elements[3]?.trim() ?? "";
          currentClaim.patientName = [first, last].filter(Boolean).join(" ");
        } else if (entity === "82") {
          // Rendering provider; NM109 = NPI when NM108 = XX.
          if (elements[7]?.trim() === "XX") {
            currentClaim.renderingProviderNpi = elements[8]?.trim();
          }
        }
        break;
      }
      case "SVC": {
        finishService();
        inServiceLoop = true;
        currentService = parseSvc(segment, delimiters);
        break;
      }
      case "DTM": {
        const qualifier = elements[0]?.trim();
        const date = ediDate(elements[1]);
        if (!date) break;
        if (inServiceLoop && currentService) {
          if (qualifier === "472" || qualifier === "150") {
            currentService.serviceDate = date;
          }
        } else if (currentClaim) {
          if (qualifier === "232" || qualifier === "472" || qualifier === "050") {
            currentClaim.serviceDate ??= date;
          }
        } else if (qualifier === "405") {
          result.paidDate = date;
        }
        break;
      }
      case "LQ": {
        // Remark code (RARC) reference, qualifier HE.
        if (inServiceLoop && currentService && elements[0]?.trim() === "HE") {
          const code = elements[1]?.trim();
          if (code) currentService.remarkCodes.push(code);
        }
        break;
      }
      case "SE":
      case "GE":
      case "IEA": {
        finishClaim();
        break;
      }
      default:
        break;
    }
  }

  finishClaim();

  // Propagate the claim service date down to lines that lacked an explicit one.
  for (const claim of result.claims) {
    for (const line of claim.serviceLines) {
      line.serviceDate ??= claim.serviceDate;
    }
  }

  return result;
}

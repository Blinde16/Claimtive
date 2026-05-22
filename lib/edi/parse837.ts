import { EdiDelimiters, splitComponents, tokenize } from "./tokenizer";
import { Parsed837, Parsed837Claim, Parsed837ServiceLine } from "./types";

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function ediDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const start = value.split("-")[0].trim();
  if (!/^\d{8}$/.test(start)) return undefined;
  return `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
}

export function parse837(raw: string): Parsed837 {
  const { delimiters, segments } = tokenize(raw);

  const result: Parsed837 = {
    type: "X837",
    claims: []
  };

  let currentClaim: Parsed837Claim | null = null;
  let currentLine: Parsed837ServiceLine | null = null;
  // Subscriber/patient (loop 2010BA) appears before the CLM it belongs to.
  let pendingPatientName: string | undefined;

  const finishLine = () => {
    if (currentClaim && currentLine) currentClaim.serviceLines.push(currentLine);
    currentLine = null;
  };

  const finishClaim = () => {
    finishLine();
    if (currentClaim) result.claims.push(currentClaim);
    currentClaim = null;
  };

  const parseSv1 = (elements: string[], delim: EdiDelimiters): Parsed837ServiceLine => {
    const composite = splitComponents(elements[0], delim);
    const procedureCode = composite[1]?.trim() ?? composite[0]?.trim() ?? "";
    const modifier = composite[2]?.trim() || undefined;
    const pointers = splitComponents(elements[6], delim)
      .map((p) => p.trim())
      .filter(Boolean);
    return {
      procedureCode,
      modifier,
      chargeAmount: round2(num(elements[1])),
      units: elements[3] ? num(elements[3]) : 1,
      diagnosisPointers: pointers,
      serviceDate: undefined
    };
  };

  for (const segment of segments) {
    const { id, elements } = segment;

    switch (id) {
      case "ST": {
        result.controlNumber = elements[1]?.trim();
        break;
      }
      case "NM1": {
        const entity = elements[0]?.trim();
        const isNpi = elements[7]?.trim() === "XX";
        if (entity === "85" && isNpi) {
          result.billingProviderNpi = elements[8]?.trim();
        } else if (entity === "PR") {
          // NM103 (index 2) carries the organization name.
          result.payerName ??= elements[2]?.trim();
        } else if (entity === "82" && isNpi && currentClaim) {
          currentClaim.renderingProviderNpi = elements[8]?.trim();
        } else if (entity === "IL" || entity === "QC") {
          const last = elements[2]?.trim() ?? "";
          const first = elements[3]?.trim() ?? "";
          const name = [first, last].filter(Boolean).join(" ");
          if (currentClaim) currentClaim.patientName = name;
          else pendingPatientName = name;
        }
        break;
      }
      case "CLM": {
        finishClaim();
        currentClaim = {
          patientControlNumber: elements[0]?.trim() || undefined,
          totalCharge: round2(num(elements[1])),
          patientName: pendingPatientName,
          diagnosisCodes: [],
          serviceLines: []
        };
        break;
      }
      case "HI": {
        if (!currentClaim) break;
        for (const el of elements) {
          const comps = splitComponents(el, delimiters);
          // Qualifiers ABK/BK = principal dx, ABF/BF = additional dx.
          const qualifier = comps[0]?.trim();
          const code = comps[1]?.trim();
          if (code && /^(A?B[KF])$/.test(qualifier ?? "")) {
            currentClaim.diagnosisCodes.push(code);
          }
        }
        break;
      }
      case "LX": {
        finishLine();
        break;
      }
      case "SV1":
      case "SV2": {
        if (!currentClaim) break;
        currentLine = parseSv1(elements, delimiters);
        break;
      }
      case "DTP": {
        // DTP*472 = service date (DTP03 holds the date, possibly a range).
        if (elements[0]?.trim() === "472") {
          const date = ediDate(elements[2]);
          if (date) {
            if (currentLine) currentLine.serviceDate = date;
          }
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
  return result;
}

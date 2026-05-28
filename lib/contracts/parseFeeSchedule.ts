// Fee-schedule CSV parser.
//
// Clinics keep their contracted rates as spreadsheets ("fee schedules"): a
// procedure code (CPT/HCPCS), an optional modifier, and the allowed amount the
// payer agreed to pay. This module turns that CSV into validated rate rows so
// the contract-upload server action can upsert them.
//
// Pure logic, no I/O — fully unit-testable. Errors are COLLECTED per row (with
// line numbers) rather than thrown, so the UI can report "imported 45, skipped 3".

export interface ParsedRate {
  payerName: string;
  procedureCode: string;
  modifier: string | null;
  allowedAmount: number;
}

export interface RowError {
  line: number; // 1-based line in the source file (header = line 1)
  message: string;
}

export interface FeeScheduleParseResult {
  rates: ParsedRate[];
  errors: RowError[];
  /** Distinct payer names encountered, with rate counts. */
  payers: Array<{ payerName: string; count: number }>;
}

// Accepted header aliases (lowercased, non-alphanumeric stripped) → canonical.
const COLUMN_ALIASES: Record<string, "payer" | "code" | "modifier" | "amount"> = {
  payer: "payer",
  payername: "payer",
  insurance: "payer",
  insurer: "payer",
  carrier: "payer",
  plan: "payer",

  procedurecode: "code",
  procedure: "code",
  cpt: "code",
  cptcode: "code",
  hcpcs: "code",
  hcpcscode: "code",
  code: "code",
  proc: "code",

  modifier: "modifier",
  mod: "modifier",
  modifiers: "modifier",

  allowedamount: "amount",
  allowed: "amount",
  allowedamt: "amount",
  amount: "amount",
  rate: "amount",
  contractedrate: "amount",
  contracted: "amount",
  fee: "amount",
  allowedrate: "amount"
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** RFC4180-ish CSV parser: handles quoted fields, escaped quotes, and CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a leading UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // End of row. Swallow the \n of a \r\n pair.
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseFeeSchedule(
  text: string,
  opts: { defaultPayer?: string } = {}
): FeeScheduleParseResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const errors: RowError[] = [];
  const rates: ParsedRate[] = [];

  if (rows.length === 0) {
    return { rates, errors: [{ line: 1, message: "File is empty." }], payers: [] };
  }

  // Map header columns.
  const header = rows[0].map((h) => normalizeHeader(h));
  const colIndex: Partial<Record<"payer" | "code" | "modifier" | "amount", number>> = {};
  header.forEach((h, i) => {
    const canonical = COLUMN_ALIASES[h];
    if (canonical && colIndex[canonical] === undefined) colIndex[canonical] = i;
  });

  if (colIndex.code === undefined) {
    errors.push({
      line: 1,
      message:
        "Missing a procedure-code column. Expected a header like 'procedure_code', 'cpt', or 'code'."
    });
  }
  if (colIndex.amount === undefined) {
    errors.push({
      line: 1,
      message:
        "Missing an allowed-amount column. Expected a header like 'allowed_amount', 'rate', or 'amount'."
    });
  }
  const defaultPayer = opts.defaultPayer?.trim();
  if (colIndex.payer === undefined && !defaultPayer) {
    errors.push({
      line: 1,
      message:
        "No payer column found and no default payer provided. Add a 'payer' column or select a payer for the upload."
    });
  }
  if (errors.length > 0) return { rates, errors, payers: [] };

  const seen = new Set<string>(); // dedupe within the file by payer|code|modifier
  const payerCounts = new Map<string, number>();

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cols = rows[r];

    const codeRaw = (cols[colIndex.code!] ?? "").trim().toUpperCase();
    if (!codeRaw) {
      errors.push({ line, message: "Missing procedure code." });
      continue;
    }

    const amountRaw = (cols[colIndex.amount!] ?? "").trim();
    const amount = parseAmount(amountRaw);
    if (amount === null) {
      errors.push({ line, message: `Invalid allowed amount: "${amountRaw}".` });
      continue;
    }
    if (amount < 0) {
      errors.push({ line, message: `Allowed amount cannot be negative: ${amount}.` });
      continue;
    }

    const payerName =
      (colIndex.payer !== undefined ? cols[colIndex.payer]?.trim() : "") ||
      defaultPayer ||
      "";
    if (!payerName) {
      errors.push({ line, message: "Missing payer (no column value and no default)." });
      continue;
    }

    const modifierRaw =
      colIndex.modifier !== undefined
        ? (cols[colIndex.modifier] ?? "").trim().toUpperCase()
        : "";
    const modifier = modifierRaw || null;

    const key = `${payerName.toUpperCase()}|${codeRaw}|${modifier ?? ""}`;
    if (seen.has(key)) {
      errors.push({
        line,
        message: `Duplicate of ${codeRaw}${modifier ? "-" + modifier : ""} for ${payerName} within this file.`
      });
      continue;
    }
    seen.add(key);

    rates.push({ payerName, procedureCode: codeRaw, modifier, allowedAmount: amount });
    payerCounts.set(payerName, (payerCounts.get(payerName) ?? 0) + 1);
  }

  return {
    rates,
    errors,
    payers: [...payerCounts.entries()].map(([payerName, count]) => ({ payerName, count }))
  };
}

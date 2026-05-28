import { describe, expect, it } from "vitest";
import { parseExtractionResponse } from "./extractRatesFromPdf";

describe("parseExtractionResponse", () => {
  it("parses a clean response", () => {
    const raw = JSON.stringify({
      payerName: "Aetna",
      effectiveDate: "2026-01-01",
      notes: null,
      rates: [
        { procedureCode: "99213", modifier: null, allowedAmount: 130, description: "Office visit" },
        { procedureCode: "29881", modifier: "RT", allowedAmount: 1100.5, description: null }
      ]
    });
    const result = parseExtractionResponse(raw);
    expect(result.payerName).toBe("Aetna");
    expect(result.effectiveDate).toBe("2026-01-01");
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0]).toMatchObject({
      procedureCode: "99213",
      modifier: null,
      allowedAmount: 130
    });
    expect(result.rates[1].modifier).toBe("RT");
    expect(result.warnings).toHaveLength(0);
  });

  it("strips markdown code fences", () => {
    const raw =
      '```json\n{"payerName":"BCBS","effectiveDate":null,"notes":null,"rates":[{"procedureCode":"99214","modifier":null,"allowedAmount":210}]}\n```';
    const result = parseExtractionResponse(raw);
    expect(result.payerName).toBe("BCBS");
    expect(result.rates).toHaveLength(1);
    expect(result.rates[0].allowedAmount).toBe(210);
  });

  it("normalizes string amounts with $ and commas", () => {
    const raw = JSON.stringify({
      rates: [{ procedureCode: "20610", allowedAmount: "$1,250.75" }]
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates[0].allowedAmount).toBe(1250.75);
  });

  it("uppercases codes and modifiers", () => {
    const raw = JSON.stringify({
      rates: [{ procedureCode: "j1100", modifier: "lt", allowedAmount: 5 }]
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates[0].procedureCode).toBe("J1100");
    expect(result.rates[0].modifier).toBe("LT");
  });

  it("skips rows missing a code or amount and warns", () => {
    const raw = JSON.stringify({
      rates: [
        { procedureCode: "99213", allowedAmount: 130 },
        { procedureCode: "", allowedAmount: 50 },
        { procedureCode: "99214", allowedAmount: "abc" },
        { modifier: "25", allowedAmount: 99 }
      ]
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates).toHaveLength(1);
    expect(result.warnings.some((w) => /3 row\(s\) could not be read/.test(w))).toBe(true);
  });

  it("dedupes by code + modifier, keeping the first", () => {
    const raw = JSON.stringify({
      rates: [
        { procedureCode: "99213", modifier: null, allowedAmount: 130 },
        { procedureCode: "99213", modifier: null, allowedAmount: 999 },
        { procedureCode: "99213", modifier: "25", allowedAmount: 150 }
      ]
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0].allowedAmount).toBe(130); // first wins
    expect(result.rates[1].modifier).toBe("25");
  });

  it("flags $0 rates for review", () => {
    const raw = JSON.stringify({
      rates: [{ procedureCode: "99213", allowedAmount: 0 }]
    });
    const result = parseExtractionResponse(raw);
    expect(result.warnings.some((w) => /\$0\.00/.test(w))).toBe(true);
  });

  it("rejects negative amounts", () => {
    const raw = JSON.stringify({
      rates: [{ procedureCode: "99213", allowedAmount: -50 }]
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates).toHaveLength(0);
  });

  it("handles a percent-based schedule with empty rates + notes", () => {
    const raw = JSON.stringify({
      payerName: "Cigna",
      effectiveDate: null,
      notes: "Rates are expressed as 120% of Medicare; no fixed dollar amounts present.",
      rates: []
    });
    const result = parseExtractionResponse(raw);
    expect(result.rates).toHaveLength(0);
    expect(result.notes).toMatch(/Medicare/);
    // notes present → no "no rates extracted" warning
    expect(result.warnings.some((w) => /No rates were extracted/.test(w))).toBe(false);
  });

  it("returns a graceful result on non-JSON input", () => {
    const result = parseExtractionResponse("I could not read this document, sorry.");
    expect(result.rates).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/Could not read/);
  });

  it("ignores an invalid effective date", () => {
    const raw = JSON.stringify({
      effectiveDate: "January 2026",
      rates: [{ procedureCode: "99213", allowedAmount: 130 }]
    });
    const result = parseExtractionResponse(raw);
    expect(result.effectiveDate).toBeNull();
  });
});

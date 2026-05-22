import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse837 } from "./parse837";
import { detectTransactionType, tokenize } from "./tokenizer";

const sample = readFileSync(
  join(process.cwd(), "sample-data", "sample-837p.edi"),
  "utf8"
);

describe("parse837", () => {
  it("detects an 837 transaction set", () => {
    expect(detectTransactionType(tokenize(sample))).toBe("X837");
  });

  const parsed = parse837(sample);

  it("parses billing provider and payer", () => {
    expect(parsed.billingProviderNpi).toBe("1234567893");
    expect(parsed.payerName).toBe("BLUE CROSS BLUE SHIELD");
  });

  it("parses claims with charges and diagnoses", () => {
    expect(parsed.claims).toHaveLength(2);
    const first = parsed.claims[0];
    expect(first.patientControlNumber).toBe("PCN1001");
    expect(first.totalCharge).toBe(1500);
    expect(first.diagnosisCodes).toEqual(["M1711", "M545"]);
    expect(first.patientName).toBe("JOHN DOE");
  });

  it("parses service lines", () => {
    const first = parsed.claims[0];
    expect(first.serviceLines).toHaveLength(2);
    expect(first.serviceLines[0].procedureCode).toBe("99214");
    expect(first.serviceLines[0].chargeAmount).toBe(250);
    expect(first.serviceLines[0].serviceDate).toBe("2024-01-02");
    expect(first.serviceLines[1].procedureCode).toBe("29881");
  });
});

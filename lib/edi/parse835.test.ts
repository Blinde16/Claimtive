import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse835 } from "./parse835";
import { detectTransactionType, tokenize } from "./tokenizer";

const sampleDir = join(process.cwd(), "sample-data");
const bcbs = readFileSync(join(sampleDir, "sample-835-bcbs.edi"), "utf8");
const aetna = readFileSync(join(sampleDir, "sample-835-aetna.edi"), "utf8");

describe("tokenizer", () => {
  it("detects standard delimiters from the ISA header", () => {
    const { delimiters } = tokenize(bcbs);
    expect(delimiters.element).toBe("*");
    expect(delimiters.component).toBe(":");
    expect(delimiters.segment).toBe("~");
  });

  it("identifies an 835 transaction set", () => {
    expect(detectTransactionType(tokenize(bcbs))).toBe("X835");
  });
});

describe("parse835 — BCBS sample", () => {
  const parsed = parse835(bcbs);

  it("extracts header and payer", () => {
    expect(parsed.type).toBe("X835");
    expect(parsed.controlNumber).toBe("0001");
    expect(parsed.payerName).toBe("BLUE CROSS BLUE SHIELD");
    expect(parsed.payerId).toBe("BCBS001");
    expect(parsed.totalPaid).toBe(4200);
    expect(parsed.checkNumber).toBe("CHKEFT0001");
    expect(parsed.paidDate).toBe("2024-01-15");
  });

  it("parses all three claims", () => {
    expect(parsed.claims).toHaveLength(3);
    expect(parsed.claims.map((c) => c.patientControlNumber)).toEqual([
      "PCN1001",
      "PCN1002",
      "PCN1003"
    ]);
  });

  it("parses claim-level fields", () => {
    const denied = parsed.claims[1];
    expect(denied.patientControlNumber).toBe("PCN1002");
    expect(denied.statusCode).toBe("4");
    expect(denied.totalCharge).toBe(800);
    expect(denied.totalPaid).toBe(0);
    expect(denied.payerClaimControlNumber).toBe("PAYERCLM5002");
    expect(denied.patientName).toBe("JANE ROE");
    expect(denied.renderingProviderNpi).toBe("1234567893");
  });

  it("parses service lines with procedure codes and adjustments", () => {
    const clean = parsed.claims[0];
    expect(clean.serviceLines).toHaveLength(2);
    const [first, second] = clean.serviceLines;
    expect(first.procedureCode).toBe("99214");
    expect(first.chargeAmount).toBe(250);
    expect(first.paidAmount).toBe(200);
    expect(first.serviceDate).toBe("2024-01-02");
    expect(first.adjustments).toEqual([
      { level: "SERVICE", groupCode: "CO", reasonCode: "45", amount: 25, quantity: undefined },
      { level: "SERVICE", groupCode: "PR", reasonCode: "1", amount: 25, quantity: undefined }
    ]);
    expect(second.procedureCode).toBe("29881");
  });

  it("captures service-level remark codes", () => {
    const denied = parsed.claims[1];
    expect(denied.serviceLines[0].remarkCodes).toEqual(["N130"]);
  });
});

describe("parse835 — Aetna sample", () => {
  const parsed = parse835(aetna);

  it("parses five claims with the expected statuses", () => {
    expect(parsed.claims).toHaveLength(5);
    expect(parsed.claims.map((c) => c.statusCode)).toEqual([
      "1",
      "4",
      "4",
      "4",
      "1"
    ]);
  });

  it("reads multi-unit service lines", () => {
    const therapy = parsed.claims[1].serviceLines[0];
    expect(therapy.procedureCode).toBe("97140");
    expect(therapy.units).toBe(3);
  });
});

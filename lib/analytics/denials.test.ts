import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse835 } from "../edi/parse835";
import { analyzeClaim, ContractRateLookup } from "./denials";
import { classifyAdjustment } from "./carc";

const bcbs = parse835(
  readFileSync(join(process.cwd(), "sample-data", "sample-835-bcbs.edi"), "utf8")
);

const rates: Record<string, number> = {
  "99214": 210,
  "29881": 1100,
  "99213": 130,
  "20610": 250
};
const rateLookup: ContractRateLookup = (code) => rates[code];

describe("classifyAdjustment", () => {
  it("treats contractual write-offs as non-actionable", () => {
    expect(classifyAdjustment("CO", "45").actionable).toBe(false);
  });

  it("treats patient responsibility as non-actionable", () => {
    expect(classifyAdjustment("PR", "1").actionable).toBe(false);
  });

  it("flags authorization denials as actionable", () => {
    const cls = classifyAdjustment("CO", "197");
    expect(cls.actionable).toBe(true);
    expect(cls.category).toBe("Authorization");
  });

  it("flags bundling as actionable", () => {
    expect(classifyAdjustment("CO", "97").category).toBe("Bundling");
    expect(classifyAdjustment("CO", "97").actionable).toBe(true);
  });
});

describe("analyzeClaim", () => {
  it("marks a fully-paid claim as clean", () => {
    const analysis = analyzeClaim(bcbs.claims[0], rateLookup);
    expect(analysis.isDenied).toBe(false);
    expect(analysis.deniedAmount).toBe(0);
    expect(analysis.underpaidAmount).toBe(0);
    expect(analysis.isUnderpaid).toBe(false);
  });

  it("detects an authorization denial", () => {
    const analysis = analyzeClaim(bcbs.claims[1], rateLookup);
    expect(analysis.isDenied).toBe(true);
    expect(analysis.deniedAmount).toBe(800);
    expect(analysis.primaryDenialCode).toBe("197");
    expect(analysis.primaryDenialReason).toMatch(/authorization/i);
    expect(analysis.services[0].isDenied).toBe(true);
  });

  it("detects partial denials and underpayments on a paid claim", () => {
    const analysis = analyzeClaim(bcbs.claims[2], rateLookup);
    // Not a full denial — the claim was paid, but it lost money two ways.
    expect(analysis.isDenied).toBe(false);
    // CO-97 bundling on the 20610 line is recoverable.
    expect(analysis.deniedAmount).toBe(120);
    // 99213 underpaid by 10, 20610 underpaid by 70.
    expect(analysis.underpaidAmount).toBe(80);
    expect(analysis.isUnderpaid).toBe(true);

    const [office, injection] = analysis.services;
    expect(office.underpaidAmount).toBe(10);
    expect(injection.underpaidAmount).toBe(70);
    expect(injection.allowedAmount).toBe(180);
  });
});

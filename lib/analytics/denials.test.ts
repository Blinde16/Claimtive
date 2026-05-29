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
const rateLookup: ContractRateLookup = (_payerId, code) => rates[code];

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
    // Not a full denial — the claim was paid, but it lost money.
    expect(analysis.isDenied).toBe(false);
    // CO-97 bundling on the 20610 line is recoverable.
    expect(analysis.deniedAmount).toBe(120);
    // Only the 99213 office line is underpaid (by 10). The 20610 line is NOT
    // underpaid: its CO-97 $120 is an *actionable* reduction already counted in
    // deniedAmount, so it no longer also depresses the underpayment baseline
    // (previously it double-counted that $120 as a $70 underpayment).
    expect(analysis.underpaidAmount).toBe(10);
    expect(analysis.isUnderpaid).toBe(true);

    const [office, injection] = analysis.services;
    // 99213: charge 200, CO-45 (legit contractual) 80 → expectedAllowed 120,
    // contracted 130 → underpaid 10.
    expect(office.underpaidAmount).toBe(10);
    // 20610: charge 400, CO-45 100 (legit) + CO-97 120 (actionable). Baseline
    // excludes the actionable CO-97, so expectedAllowed = 400 - 100 = 300,
    // which already exceeds the 250 contracted rate → underpaid 0.
    expect(injection.underpaidAmount).toBe(0);
    // Display allowedAmount keeps charge minus ALL CO (400 - 220 = 180).
    expect(injection.allowedAmount).toBe(180);
  });
});

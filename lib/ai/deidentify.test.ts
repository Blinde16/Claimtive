import { describe, expect, it } from "vitest";
import { assertNoPhi, buildInsightPayload } from "./deidentify";

const baseMetrics = {
  claimCount: 8,
  totalBilled: 5875,
  totalPaid: 2710,
  totalDenied: 2295,
  totalUnderpaid: 140,
  recoverable: 2435,
  deniedClaimCount: 4,
  underpaidClaimCount: 2,
  denialRate: 0.5,
  netCollectionRate: 0.461
};

describe("buildInsightPayload", () => {
  it("passes through whitelisted aggregate fields", () => {
    const out = buildInsightPayload({
      metrics: baseMetrics,
      categories: [{ category: "Authorization", amount: 800, count: 1 }],
      reasons: [
        {
          groupCode: "CO",
          reasonCode: "197",
          description: "Precertification/authorization/notification absent",
          category: "Authorization",
          amount: 800,
          count: 1
        }
      ],
      payers: [
        {
          payerName: "AETNA",
          claimCount: 5,
          billed: 2975,
          paid: 1210,
          denied: 1375,
          underpaid: 60,
          deniedClaims: 3,
          denialRate: 0.6
        }
      ]
    });

    expect(out.metrics.recoverable).toBe(2435);
    expect(out.categories[0].category).toBe("Authorization");
    expect(out.reasons[0].reasonCode).toBe("197");
    expect(out.payers[0].payerName).toBe("AETNA");
  });

  it("does NOT pass through non-whitelisted fields (defensive picking)", () => {
    // Simulate a PayerRow that somehow gained a PHI-like field upstream.
    const sketchyPayer = {
      payerName: "AETNA",
      claimCount: 5,
      billed: 2975,
      paid: 1210,
      denied: 1375,
      underpaid: 60,
      deniedClaims: 3,
      denialRate: 0.6,
      // Pretend a future refactor accidentally added these:
      patientName: "JANE ROE",
      patientControlNumber: "PCN1002"
    } as unknown as Parameters<typeof buildInsightPayload>[0]["payers"][number];

    const out = buildInsightPayload({
      metrics: baseMetrics,
      categories: [],
      reasons: [],
      payers: [sketchyPayer]
    });

    // The whitelisted output must NOT contain the leaked fields.
    expect(out.payers[0]).not.toHaveProperty("patientName");
    expect(out.payers[0]).not.toHaveProperty("patientControlNumber");
    // The output is also re-keyed (deniedClaims dropped from the AI view).
    expect(out.payers[0]).not.toHaveProperty("deniedClaims");
  });

  it("rejects payloads that hit a PHI tripwire", () => {
    // If de-id is bypassed and a payload with an SSN-like string is constructed,
    // buildInsightPayload's final assertNoPhi must fire. Reach in via category
    // strings (the easiest place for an attacker/bug to inject a string value).
    expect(() =>
      buildInsightPayload({
        metrics: baseMetrics,
        categories: [
          { category: "Authorization 123-45-6789" as never, amount: 1, count: 1 }
        ],
        reasons: [],
        payers: []
      })
    ).toThrow(/PHI pattern \(SSN-like\)/);
  });
});

describe("assertNoPhi", () => {
  it("accepts a clean payload", () => {
    expect(() =>
      assertNoPhi({ metrics: { recoverable: 2435 }, categories: [] })
    ).not.toThrow();
  });

  it("throws on SSN", () => {
    expect(() => assertNoPhi({ note: "MRN 123-45-6789" })).toThrow(/SSN-like/);
  });

  it("throws on 10-digit NPI-like number embedded in a string", () => {
    expect(() => assertNoPhi({ note: "provider 1234567890" })).toThrow(
      /NPI-like/
    );
  });

  it("throws on a specific (YYYY-MM-DD) date", () => {
    expect(() => assertNoPhi({ serviceDate: "2026-03-14" })).toThrow(
      /specific date/
    );
  });

  it("walks nested arrays and objects", () => {
    expect(() =>
      assertNoPhi({ items: [{ child: { ssn: "123-45-6789" } }] })
    ).toThrow(/SSN-like/);
  });
});

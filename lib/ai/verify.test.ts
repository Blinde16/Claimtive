import { describe, expect, it } from "vitest";
import type { AiInsightPayload } from "./deidentify";
import {
  extractCurrencies,
  extractPercents,
  verifyInsightOutput
} from "./verify";

const source: AiInsightPayload = {
  metrics: {
    claimCount: 8,
    deniedClaimCount: 4,
    underpaidClaimCount: 2,
    totalBilled: 5875,
    totalPaid: 2710,
    totalDenied: 2295,
    totalUnderpaid: 140,
    recoverable: 2435,
    netCollectionRate: 0.4613,
    denialRate: 0.5
  },
  categories: [
    { category: "Authorization", amount: 800, count: 1 },
    { category: "Duplicate", amount: 600, count: 1 }
  ],
  reasons: [
    {
      groupCode: "CO",
      reasonCode: "197",
      description: "Precertification/authorization/notification absent",
      category: "Authorization",
      amount: 800,
      count: 1
    },
    {
      groupCode: "CO",
      reasonCode: "18",
      description: "Exact duplicate claim or service",
      category: "Duplicate",
      amount: 600,
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
      denialRate: 0.6
    },
    {
      payerName: "BLUE CROSS BLUE SHIELD",
      claimCount: 3,
      billed: 2900,
      paid: 1500,
      denied: 920,
      underpaid: 80,
      denialRate: 0.3333
    }
  ]
};

describe("extractCurrencies / extractPercents", () => {
  it("extracts dollar amounts", () => {
    expect(extractCurrencies("Recovered $2,435 across 8 claims")).toEqual([2435]);
    expect(extractCurrencies("$800 + $600 + $0")).toEqual([800, 600, 0]);
  });
  it("extracts percentages", () => {
    expect(extractPercents("Denial rate of 50.0% exceeds benchmark")).toEqual([
      50.0
    ]);
  });
});

describe("verifyInsightOutput", () => {
  it("accepts output where every number derives from source", () => {
    const out = [
      "$2,435 in recoverable revenue identified",
      "Authorization is the largest driver at $800",
      "Denial rate of 50.0% exceeds benchmark",
      "AETNA accounts for the most leakage at $1,435 (60.0% denial rate)"
    ];
    const r = verifyInsightOutput(out, source);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("accepts a derived category-share percent (within tolerance)", () => {
    // Authorization $800 / totalDenied $2,295 ≈ 34.86% → "35%" is within 0.5pp
    const r = verifyInsightOutput(["Authorization is 35% of denial dollars"], source);
    expect(r.ok).toBe(true);
  });

  it("rejects an invented dollar amount", () => {
    const r = verifyInsightOutput(
      ["We found $9,999 in recoverable revenue"],
      source
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0].kind).toBe("currency");
    expect(r.violations[0].value).toBe("$9,999");
  });

  it("rejects an invented percentage", () => {
    const r = verifyInsightOutput(["Denial rate of 87% exceeds benchmark"], source);
    expect(r.ok).toBe(false);
    expect(r.violations[0].kind).toBe("percent");
  });

  it("rejects an unknown payer name", () => {
    const r = verifyInsightOutput(
      ["UNITEDHEALTHCARE accounts for the most leakage"],
      source
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.kind === "payer")).toBe(true);
  });

  it("rejects an unknown CARC code", () => {
    const r = verifyInsightOutput(
      ["The biggest issue is CARC 999 denials"],
      source
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.kind === "carc")).toBe(true);
  });

  it("allows currency within $1 tolerance (rounding)", () => {
    // recoverable is exactly $2,435 — "$2,436" is within $1
    const r = verifyInsightOutput(["Recovered $2,436"], source);
    expect(r.ok).toBe(true);
  });

  it("allows percent within 0.5pp tolerance", () => {
    // netCollectionRate ≈ 46.13% — "46%" is within 0.5pp
    const r = verifyInsightOutput(["Net collection rate of 46%"], source);
    expect(r.ok).toBe(true);
  });
});

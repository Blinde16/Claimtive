import { describe, expect, it } from "vitest";
import {
  aggregateCobByClaim,
  patientResponsibilityLabel,
  summarizePrTypes
} from "./leakage";

describe("patientResponsibilityLabel", () => {
  it("labels the standard PR reason codes", () => {
    expect(patientResponsibilityLabel("1")).toBe("Deductible");
    expect(patientResponsibilityLabel("2")).toBe("Coinsurance");
    expect(patientResponsibilityLabel("3")).toBe("Copay");
  });

  it("falls back to a generic label for other codes", () => {
    expect(patientResponsibilityLabel("45")).toBe("Other patient responsibility");
  });
});

describe("summarizePrTypes", () => {
  it("labels and sorts by amount descending", () => {
    const rows = [
      { reasonCode: "1", amount: 300, count: 2 },
      { reasonCode: "2", amount: 500, count: 3 },
      { reasonCode: "3", amount: 100, count: 1 }
    ];
    const result = summarizePrTypes(rows);
    expect(result.map((r) => r.label)).toEqual(["Coinsurance", "Deductible", "Copay"]);
    expect(result[0].amount).toBe(500);
  });

  it("merges all non-standard PR codes into a single Other bucket", () => {
    const rows = [
      { reasonCode: "1", amount: 100, count: 1 },
      { reasonCode: "66", amount: 40, count: 1 },
      { reasonCode: "100", amount: 60, count: 2 }
    ];
    const result = summarizePrTypes(rows);
    const other = result.find((r) => r.label === "Other patient responsibility");
    expect(other).toBeDefined();
    expect(other!.amount).toBe(100);
    expect(other!.count).toBe(3);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizePrTypes([])).toEqual([]);
  });
});

describe("aggregateCobByClaim", () => {
  it("totals claim-level and service-level COB dollars per claim", () => {
    const { byClaim, total } = aggregateCobByClaim([
      { amount: 100, claimId: "c1", serviceLine: null },
      { amount: 50, claimId: null, serviceLine: { claimId: "c1" } },
      { amount: 200, claimId: "c2", serviceLine: null }
    ]);
    expect(byClaim.get("c1")).toBe(150);
    expect(byClaim.get("c2")).toBe(200);
    expect(total).toBe(350);
  });

  it("ignores adjustments with no resolvable claim id", () => {
    const { byClaim, total } = aggregateCobByClaim([
      { amount: 80, claimId: null, serviceLine: null },
      { amount: 20, claimId: "c1", serviceLine: null }
    ]);
    expect(byClaim.size).toBe(1);
    expect(byClaim.get("c1")).toBe(20);
    expect(total).toBe(20);
  });

  it("rounds to cents", () => {
    const { byClaim, total } = aggregateCobByClaim([
      { amount: 10.1, claimId: "c1", serviceLine: null },
      { amount: 20.2, claimId: "c1", serviceLine: null }
    ]);
    expect(byClaim.get("c1")).toBe(30.3);
    expect(total).toBe(30.3);
  });

  it("returns empty for no adjustments", () => {
    const { byClaim, total } = aggregateCobByClaim([]);
    expect(byClaim.size).toBe(0);
    expect(total).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { findUnadjudicated, type SubmittedClaimLite } from "./matching";

const NOW = new Date("2026-03-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function claim(p: Partial<SubmittedClaimLite>): SubmittedClaimLite {
  return {
    id: "c",
    patientControlNumber: "PCN1",
    payerName: "AETNA",
    serviceDate: daysAgo(60),
    createdAt: daysAgo(55),
    totalCharge: 100,
    ...p
  };
}

describe("findUnadjudicated", () => {
  it("skips claims that have a remittance", () => {
    const out = findUnadjudicated(
      [claim({ patientControlNumber: "PCN1" })],
      new Set(["PCN1"]),
      { now: NOW, agingDays: 30 }
    );
    expect(out).toHaveLength(0);
  });

  it("flags an aged submitted claim with no remittance", () => {
    const out = findUnadjudicated(
      [claim({ id: "x", patientControlNumber: "PCN9", serviceDate: daysAgo(60), totalCharge: 980 })],
      new Set(["PCN1"]),
      { now: NOW, agingDays: 30 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("x");
    expect(out[0].ageDays).toBe(60);
    expect(out[0].totalCharge).toBe(980);
  });

  it("does NOT flag a fresh claim still within the window", () => {
    const out = findUnadjudicated(
      [claim({ patientControlNumber: "PCN9", serviceDate: daysAgo(10) })],
      new Set(["PCN1"]),
      { now: NOW, agingDays: 30 }
    );
    expect(out).toHaveLength(0);
  });

  it("flags an unmatched claim with no service date (timeliness unverifiable)", () => {
    const out = findUnadjudicated(
      [claim({ patientControlNumber: "PCN9", serviceDate: null })],
      new Set(["PCN1"]),
      { now: NOW, agingDays: 30 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].ageDays).toBeNull();
  });

  it("sorts by billed amount descending", () => {
    const out = findUnadjudicated(
      [
        claim({ id: "small", patientControlNumber: "A", totalCharge: 100 }),
        claim({ id: "big", patientControlNumber: "B", totalCharge: 900 })
      ],
      new Set(),
      { now: NOW, agingDays: 30 }
    );
    expect(out.map((c) => c.id)).toEqual(["big", "small"]);
  });
});

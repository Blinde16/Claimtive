import { describe, expect, it } from "vitest";
import { buildClaimWhere, normalizeFilter } from "./claimsFilter";

describe("normalizeFilter", () => {
  it("defaults unknown values to all", () => {
    expect(normalizeFilter(undefined)).toBe("all");
    expect(normalizeFilter("bogus")).toBe("all");
    expect(normalizeFilter("denied")).toBe("denied");
  });
});

describe("buildClaimWhere", () => {
  it("scopes to the organization", () => {
    const w = buildClaimWhere("org1", {});
    expect(w.organizationId).toBe("org1");
  });

  it("applies the denied filter", () => {
    expect(buildClaimWhere("org1", { filter: "denied" }).isDenied).toBe(true);
  });

  it("applies the underpaid filter", () => {
    expect(buildClaimWhere("org1", { filter: "underpaid" }).isUnderpaid).toBe(true);
  });

  it("applies the clean filter (remittance, not denied, not underpaid)", () => {
    const w = buildClaimWhere("org1", { filter: "clean" });
    expect(w.isDenied).toBe(false);
    expect(w.isUnderpaid).toBe(false);
    expect(w.ediFile).toEqual({ type: "X835" });
  });

  it("applies a valid work status and ignores an invalid one", () => {
    expect(buildClaimWhere("org1", { status: "APPEALED" }).workStatus).toBe("APPEALED");
    expect(buildClaimWhere("org1", { status: "NONSENSE" }).workStatus).toBeUndefined();
  });

  it("builds a case-insensitive search OR across id/name fields", () => {
    const w = buildClaimWhere("org1", { q: "roe" });
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(3);
  });

  it("omits OR when query is blank", () => {
    expect(buildClaimWhere("org1", { q: "   " }).OR).toBeUndefined();
  });

  it("combines filter + status + query", () => {
    const w = buildClaimWhere("org1", { filter: "denied", status: "IN_PROGRESS", q: "x" });
    expect(w.isDenied).toBe(true);
    expect(w.workStatus).toBe("IN_PROGRESS");
    expect(w.OR).toHaveLength(3);
  });
});

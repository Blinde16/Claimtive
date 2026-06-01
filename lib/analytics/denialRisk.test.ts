import { describe, expect, it } from "vitest";
import { assessClaim, buildDenialStats, suggestedAction } from "./denialRisk";

const hist = [
  // BCBS 64483: denied 2 of 2 for prior auth (CARC 197 = Authorization)
  { payerName: "BLUE CROSS BLUE SHIELD", procedureCode: "64483", isDenied: true, denialCode: "197", denialReason: "Precertification/authorization absent" },
  { payerName: "BLUE CROSS BLUE SHIELD", procedureCode: "64483", isDenied: true, denialCode: "197", denialReason: "Precertification/authorization absent" },
  // BCBS 99214: paid 3 of 3 (never denied)
  { payerName: "BLUE CROSS BLUE SHIELD", procedureCode: "99214", isDenied: false },
  { payerName: "BLUE CROSS BLUE SHIELD", procedureCode: "99214", isDenied: false },
  { payerName: "BLUE CROSS BLUE SHIELD", procedureCode: "99214", isDenied: false },
  // AETNA 99203: denied 1 of 2 (timely filing, CARC 29)
  { payerName: "AETNA", procedureCode: "99203", isDenied: true, denialCode: "29", denialReason: "Time limit for filing has expired" },
  { payerName: "AETNA", procedureCode: "99203", isDenied: false }
];

describe("buildDenialStats", () => {
  it("computes per-(payer, code) denial rate and dominant reason", () => {
    const stats = buildDenialStats(hist);
    const bcbs64483 = stats.get("BLUE CROSS BLUE SHIELD||64483");
    expect(bcbs64483).toMatchObject({ total: 2, denied: 2, rate: 1 });
    expect(bcbs64483?.dominantCategory).toBe("Authorization");

    const bcbs99214 = stats.get("BLUE CROSS BLUE SHIELD||99214");
    expect(bcbs99214).toMatchObject({ total: 3, denied: 0, rate: 0 });

    const aetna = stats.get("AETNA||99203");
    expect(aetna?.rate).toBe(0.5);
  });

  it("is payer-scoped — same code under a different payer is separate", () => {
    const stats = buildDenialStats(hist);
    expect(stats.has("BLUE CROSS BLUE SHIELD||99203")).toBe(false);
    expect(stats.has("AETNA||99203")).toBe(true);
  });
});

describe("assessClaim", () => {
  const stats = buildDenialStats(hist);

  it("flags a high-risk line (matching payer + denied-heavy code)", () => {
    const flags = assessClaim("BLUE CROSS BLUE SHIELD", [{ procedureCode: "64483" }], stats);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ level: "high", deniedCount: 2, totalCount: 2 });
    expect(flags[0].action).toMatch(/authorization/i);
  });

  it("does not flag a clean code", () => {
    expect(assessClaim("BLUE CROSS BLUE SHIELD", [{ procedureCode: "99214" }], stats)).toHaveLength(0);
  });

  it("does not flag the same code under a different payer with no history", () => {
    // BCBS has no 99203 history → no flag even though Aetna denies it.
    expect(assessClaim("BLUE CROSS BLUE SHIELD", [{ procedureCode: "99203" }], stats)).toHaveLength(0);
  });

  it("marks 40-70% as elevated, not high", () => {
    const flags = assessClaim("AETNA", [{ procedureCode: "99203" }], stats);
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe("elevated");
  });

  it("respects the minimum-sample floor (a single past claim doesn't flag)", () => {
    const thin = buildDenialStats([
      { payerName: "CIGNA", procedureCode: "10060", isDenied: true, denialCode: "197" }
    ]);
    expect(assessClaim("CIGNA", [{ procedureCode: "10060" }], thin)).toHaveLength(0);
  });
});

describe("suggestedAction", () => {
  it("maps categories to concrete pre-empts", () => {
    expect(suggestedAction("Authorization")).toMatch(/authorization/i);
    expect(suggestedAction("Timely Filing")).toMatch(/deadline/i);
    expect(suggestedAction(undefined)).toMatch(/review/i);
  });
});

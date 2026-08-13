import { describe, expect, it } from "vitest";
import { resolveClientIp, UNKNOWN_IP } from "./client-ip";

function headers(map: Record<string, string>) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null
  };
}

describe("resolveClientIp", () => {
  it("takes the entry before the load balancer's own address", () => {
    // What Cloud Run sees for a normal visitor: <client>, <GFE>.
    const ip = resolveClientIp(
      headers({ "x-forwarded-for": "203.0.113.9, 130.211.0.1" })
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("ignores entries the caller prepended", () => {
    // The attacker sends "1.2.3.4"; the load balancer appends the address it
    // actually saw plus its own. Keying on [0] would give the forged value.
    const ip = resolveClientIp(
      headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 130.211.0.1" })
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("is stable no matter how much padding the caller injects", () => {
    const forged = Array.from({ length: 20 }, (_, i) => `9.9.9.${i}`).join(", ");
    const ip = resolveClientIp(
      headers({ "x-forwarded-for": `${forged}, 203.0.113.9, 130.211.0.1` })
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("tolerates whitespace and empty entries", () => {
    const ip = resolveClientIp(
      headers({ "x-forwarded-for": " ,  203.0.113.9 ,, 130.211.0.1 , " })
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("falls back to the only entry when there is no proxy chain", () => {
    // Local dev / direct hit: nothing appended, so the single entry is all we have.
    expect(resolveClientIp(headers({ "x-forwarded-for": "127.0.0.1" }))).toBe(
      "127.0.0.1"
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(resolveClientIp(headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7"
    );
  });

  it("returns a placeholder when nothing is available", () => {
    expect(resolveClientIp(headers({}))).toBe(UNKNOWN_IP);
    expect(resolveClientIp(headers({ "x-forwarded-for": "  ,  " }))).toBe(
      UNKNOWN_IP
    );
  });
});

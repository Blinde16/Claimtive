import { afterEach, describe, expect, it } from "vitest";
import { DEMO_EMAIL, denyDemoWrite, isDemoAccount, isDemoEnabled } from "./demo";

const originalDemoEnabled = process.env.DEMO_ENABLED;

afterEach(() => {
  if (originalDemoEnabled === undefined) delete process.env.DEMO_ENABLED;
  else process.env.DEMO_ENABLED = originalDemoEnabled;
});

describe("isDemoEnabled", () => {
  it("is default-closed", () => {
    delete process.env.DEMO_ENABLED;
    expect(isDemoEnabled()).toBe(false);
    process.env.DEMO_ENABLED = "1";
    expect(isDemoEnabled()).toBe(false);
    process.env.DEMO_ENABLED = "TRUE";
    expect(isDemoEnabled()).toBe(false);
  });

  it("opens only on the exact string 'true'", () => {
    process.env.DEMO_ENABLED = "true";
    expect(isDemoEnabled()).toBe(true);
  });
});

describe("isDemoAccount", () => {
  it("matches the seeded demo address regardless of case or padding", () => {
    expect(isDemoAccount(DEMO_EMAIL)).toBe(true);
    expect(isDemoAccount("DEMO@Claimtive.com")).toBe(true);
    expect(isDemoAccount("  demo@claimtive.com  ")).toBe(true);
  });

  it("does not match lookalikes or empty values", () => {
    expect(isDemoAccount("demo@claimtive.com.attacker.test")).toBe(false);
    expect(isDemoAccount("notdemo@claimtive.com")).toBe(false);
    expect(isDemoAccount("")).toBe(false);
    expect(isDemoAccount(null)).toBe(false);
    expect(isDemoAccount(undefined)).toBe(false);
  });
});

describe("denyDemoWrite", () => {
  it("blocks the demo account with an explanatory message", () => {
    const denied = denyDemoWrite({ email: DEMO_EMAIL });
    expect(denied?.error).toMatch(/read-only demo/i);
  });

  it("blocks regardless of whether demo sign-in is currently enabled", () => {
    delete process.env.DEMO_ENABLED;
    expect(denyDemoWrite({ email: DEMO_EMAIL })).not.toBeNull();
  });

  it("lets every other account through", () => {
    expect(denyDemoWrite({ email: "clinic-owner@example.com" })).toBeNull();
  });
});

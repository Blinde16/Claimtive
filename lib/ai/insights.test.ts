import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Insight } from "../insights";
import type { AiInsightsInput } from "./insights";

// Mock the Vertex client BEFORE importing the module under test.
vi.mock("./vertex", () => ({
  AiDisabledError: class extends Error {
    constructor(reason: string) {
      super(reason);
      this.name = "AiDisabledError";
    }
  },
  isAiEnabled: vi.fn(),
  callModel: vi.fn()
}));

import * as vertex from "./vertex";
import {
  generateAiInsights,
  generateInsightsWithFallback
} from "./insights";

const input: AiInsightsInput = {
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
};

const goodAiResponse = JSON.stringify({
  insights: [
    {
      title: "$2,435 in recoverable revenue identified",
      detail:
        "Across 8 adjudicated claims, $2,295 is tied up in actionable denials and $140 in underpayments.",
      severity: "high"
    },
    {
      title: "Authorization is the largest denial driver",
      detail: "$800 (35% of denial dollars) is denied for CARC 197.",
      severity: "high"
    },
    {
      title: "AETNA accounts for the most leakage",
      detail: "$1,435 across 5 claims at a 60.0% denial rate.",
      severity: "medium"
    }
  ]
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("generateAiInsights", () => {
  it("returns null when AI is disabled", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(false);
    const out = await generateAiInsights(input);
    expect(out).toBeNull();
    expect(vertex.callModel).not.toHaveBeenCalled();
  });

  it("returns parsed insights on a clean, verified Claude response", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(goodAiResponse);
    const out = await generateAiInsights(input);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(3);
    expect(out![0].title).toContain("$2,435");
    expect(out![0].severity).toBe("high");
  });

  it("strips markdown code fences before parsing", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(
      "```json\n" + goodAiResponse + "\n```"
    );
    const out = await generateAiInsights(input);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(3);
  });

  it("returns null on malformed JSON", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue("not actually JSON at all");
    const out = await generateAiInsights(input);
    expect(out).toBeNull();
  });

  it("returns null when Claude hallucinates a dollar amount", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(
      JSON.stringify({
        insights: [
          {
            title: "$9,999 in recoverable revenue identified",
            detail: "We found $9,999 in fixable denials.",
            severity: "high"
          }
        ]
      })
    );
    const out = await generateAiInsights(input);
    expect(out).toBeNull(); // verifier rejected
  });

  it("returns null when Claude throws", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockRejectedValue(new Error("quota exceeded"));
    const out = await generateAiInsights(input);
    expect(out).toBeNull();
  });

  it("returns null when response shape is wrong (zod fail)", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(
      JSON.stringify({ insights: [{ wrong: "shape" }] })
    );
    const out = await generateAiInsights(input);
    expect(out).toBeNull();
  });
});

describe("generateInsightsWithFallback", () => {
  const ruleBased = (_: AiInsightsInput): Insight[] => [
    { title: "rule-based", detail: "fallback insight", severity: "low" }
  ];

  it("uses AI when AI succeeds", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(goodAiResponse);
    const out = await generateInsightsWithFallback(input, ruleBased);
    expect(out[0].title).toContain("$2,435"); // AI output
  });

  it("falls back when AI is disabled", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(false);
    const out = await generateInsightsWithFallback(input, ruleBased);
    expect(out[0].title).toBe("rule-based");
  });

  it("falls back when AI hallucinates", async () => {
    vi.mocked(vertex.isAiEnabled).mockReturnValue(true);
    vi.mocked(vertex.callModel).mockResolvedValue(
      JSON.stringify({
        insights: [
          { title: "$9,999 invented", detail: "$9,999 again", severity: "high" }
        ]
      })
    );
    const out = await generateInsightsWithFallback(input, ruleBased);
    expect(out[0].title).toBe("rule-based");
  });
});

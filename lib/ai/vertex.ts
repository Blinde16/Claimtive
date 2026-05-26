// Vertex AI client wrapper — the single place Claimtive talks to Claude.
//
// Calls go from this Cloud Run runtime → Vertex AI inside the SAME GCP project
// (claimtive), authenticated via the attached service account's ADC. No external
// vendor; everything stays under the Google Cloud BAA.
//
// The client is feature-flagged: until AI_ENABLED=true (and a model is set),
// callClaude() throws AiDisabledError and the orchestration in ./insights.ts
// transparently falls back to the deterministic rule-based insights.

const DEFAULT_REGION = "us-east5";

export interface ClaudeCallOptions {
  /** Tightly scoped instructions; the prompt template lives in the caller. */
  system: string;
  /** User message containing only the de-identified AiInsightPayload (JSON). */
  user: string;
  /** Cap tokens to keep latency + cost predictable. */
  maxTokens?: number;
  /** 0 for deterministic-as-possible (we are doing analysis, not creative writing). */
  temperature?: number;
}

export class AiDisabledError extends Error {
  constructor(reason: string) {
    super(`AI layer disabled: ${reason}`);
    this.name = "AiDisabledError";
  }
}

/**
 * Returns true only when every prerequisite is in place. The dashboard checks
 * this before invoking the AI path; if false, the deterministic insights run.
 */
export function isAiEnabled(): boolean {
  return (
    process.env.AI_ENABLED === "true" &&
    Boolean(process.env.VERTEX_PROJECT_ID) &&
    Boolean(process.env.VERTEX_CLAUDE_MODEL)
  );
}

/**
 * Call Claude on Vertex. Throws AiDisabledError when the feature flag is off
 * (callers should handle this by falling back to deterministic logic). Other
 * errors (network/quota/parse) propagate so the orchestrator can log + fall
 * back too.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  if (!isAiEnabled()) {
    throw new AiDisabledError(
      "AI_ENABLED / VERTEX_PROJECT_ID / VERTEX_CLAUDE_MODEL not all set"
    );
  }

  // Dynamic import so the SDK isn't pulled into cold-path bundles when the
  // feature flag is off (the common case while the deterministic engine ships).
  const { AnthropicVertex } = await import("@anthropic-ai/vertex-sdk");

  const client = new AnthropicVertex({
    projectId: process.env.VERTEX_PROJECT_ID!,
    region: process.env.VERTEX_REGION ?? DEFAULT_REGION
  });

  const response = await client.messages.create({
    model: process.env.VERTEX_CLAUDE_MODEL!,
    max_tokens: opts.maxTokens ?? 1200,
    temperature: opts.temperature ?? 0,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }]
  });

  // Concatenate just the text blocks (ignore tool_use, thinking, etc.). The
  // `block.type === "text"` narrows the union to TextBlock, exposing `.text`.
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("vertex: empty completion text");
  }
  return text;
}

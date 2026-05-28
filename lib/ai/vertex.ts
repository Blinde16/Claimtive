// Vertex AI client wrapper — the single place Claimtive talks to the LLM.
//
// Uses Gemini (Google's first-party model) via Vertex AI, in the SAME GCP
// project (claimtive), authenticated by the App Hosting compute SA's ADC. No
// external vendor; everything stays under the Google Cloud BAA. Gemini is
// chosen over Anthropic-on-Vertex because first-party models get generous
// default quota on new projects (the Anthropic models default to ~0), and
// Gemini Flash is cheaper and more than sufficient for grounded summaries.
//
// Feature-flagged: until AI_ENABLED=true (and a model is set), callModel()
// throws AiDisabledError and the orchestration in ./insights.ts transparently
// falls back to the deterministic rule-based insights.

const DEFAULT_REGION = "us-central1";

export interface ModelCallOptions {
  /** Tightly scoped instructions (the prompt template lives in the caller). */
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
    Boolean(process.env.VERTEX_MODEL)
  );
}

/**
 * Call Gemini on Vertex. Throws AiDisabledError when the feature flag is off
 * (callers fall back to deterministic logic). Other errors (network/quota/
 * parse) propagate so the orchestrator can log + fall back too.
 */
export async function callModel(opts: ModelCallOptions): Promise<string> {
  if (!isAiEnabled()) {
    throw new AiDisabledError(
      "AI_ENABLED / VERTEX_PROJECT_ID / VERTEX_MODEL not all set"
    );
  }

  // Dynamic import so the SDK isn't pulled into cold-path bundles when the
  // feature flag is off (the common case while the deterministic engine ships).
  const { GoogleGenAI } = await import("@google/genai");

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID!,
    location: process.env.VERTEX_REGION ?? DEFAULT_REGION
  });

  const response = await ai.models.generateContent({
    model: process.env.VERTEX_MODEL!,
    contents: opts.user,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxTokens ?? 1200,
      // Force valid JSON output (more reliable than asking in the prompt).
      responseMimeType: "application/json"
    }
  });

  const text = extractText(response);
  if (!text) {
    throw new Error("vertex/gemini: empty completion text");
  }
  return text;
}

/** Robustly pull the text out of a GenerateContentResponse across SDK versions. */
function extractText(response: unknown): string {
  const r = response as {
    text?: unknown;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string") return r.text.trim();
  if (typeof r.text === "function") {
    const t = (r.text as () => string)();
    if (t) return t.trim();
  }
  const fromParts = r.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  return fromParts ?? "";
}

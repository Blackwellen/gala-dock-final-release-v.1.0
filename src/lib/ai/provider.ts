// Gala Dock — AI provider (NVIDIA NIM, OpenAI-compatible). Server-only.
//
// GDPR-safe inference via NVIDIA NIM. Reads NVIDIA_NIM_API_KEY from the server env; the key
// is never sent to the client. Used by the Copilot brain (chat, planning, tool-arg synthesis)
// and metered via the ai_budget_* RPCs. See docs/specs/COPILOT_ARCHITECTURE.md.

const NIM_BASE = "https://integrate.api.nvidia.com/v1";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
  model: string;
}

/** Model tiers (NIM model ids). `fast` for routing/intent, `balanced` for reasoning. */
export const AI_MODELS = {
  fast: "meta/llama-3.1-8b-instruct",
  balanced: "meta/llama-3.3-70b-instruct",
} as const;
export type AiModelTier = keyof typeof AI_MODELS;

export function aiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_NIM_API_KEY);
}

export interface ChatOptions {
  model?: string;
  tier?: AiModelTier;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** Non-streaming chat completion. Throws on missing key or provider error. */
export async function chatComplete(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error("AI provider not configured (NVIDIA_NIM_API_KEY missing)");

  const model = opts.model ?? AI_MODELS[opts.tier ?? "fast"];
  const res = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI provider error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const u = json.usage ?? {};
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
    },
    model,
  };
}

/** Rough GBP cost estimate from token usage (Azure/NIM-style pricing; tune per contract). */
export function estimateCostPence(usage: ChatUsage): number {
  const inPer1k = 0.12; // pence per 1k input tokens
  const outPer1k = 0.47; // pence per 1k output tokens
  return (usage.promptTokens / 1000) * inPer1k + (usage.completionTokens / 1000) * outPer1k;
}

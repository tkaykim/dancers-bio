import "server-only";
import { anthropicConfigured, anthropicHealth, anthropicParseProject, ANTHROPIC_MODEL } from "./providers/anthropic";
import { geminiConfigured, geminiHealth, geminiParseProject, GEMINI_MODEL } from "./providers/gemini";
import type { ProjectIngestionData } from "./schema";

export type LlmProvider = "anthropic" | "gemini";

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic Claude Haiku 4.5",
  gemini: "Google Gemini 2.5 Flash",
};

export const LLM_PROVIDER_MODELS: Record<LlmProvider, string> = {
  anthropic: ANTHROPIC_MODEL,
  gemini: GEMINI_MODEL,
};

export function providerConfigured(p: LlmProvider): boolean {
  return p === "anthropic" ? anthropicConfigured() : geminiConfigured();
}

export async function providerHealth(p: LlmProvider) {
  return p === "anthropic" ? anthropicHealth() : geminiHealth();
}

export type ParseResult =
  | {
      ok: true;
      provider: LlmProvider;
      model: string;
      data: ProjectIngestionData;
      usage?: { input_tokens?: number; output_tokens?: number };
      latency_ms: number;
    }
  | {
      ok: false;
      provider: LlmProvider;
      model: string;
      error: string;
      latency_ms: number;
    };

export async function parseProject(
  rawText: string,
  provider: LlmProvider,
): Promise<ParseResult> {
  const t0 = Date.now();
  const r = provider === "anthropic"
    ? await anthropicParseProject(rawText)
    : await geminiParseProject(rawText);
  const latency_ms = Date.now() - t0;
  if (r.ok) {
    return {
      ok: true,
      provider,
      model: r.model,
      data: r.data,
      usage: r.usage,
      latency_ms,
    };
  }
  return {
    ok: false,
    provider,
    model: r.model,
    error: r.error,
    latency_ms,
  };
}

// 한 provider 가 비설정/실패면 다른 provider 로 fallback. 둘 다 안 되면 마지막 에러 반환.
export async function parseProjectWithFallback(
  rawText: string,
  preferred: LlmProvider,
): Promise<ParseResult> {
  const other: LlmProvider = preferred === "anthropic" ? "gemini" : "anthropic";
  if (providerConfigured(preferred)) {
    const r = await parseProject(rawText, preferred);
    if (r.ok) return r;
    if (providerConfigured(other)) {
      const r2 = await parseProject(rawText, other);
      if (r2.ok) return r2;
      return r2;
    }
    return r;
  }
  if (providerConfigured(other)) {
    return parseProject(rawText, other);
  }
  return {
    ok: false,
    provider: preferred,
    model: LLM_PROVIDER_MODELS[preferred],
    error: "LLM provider 가 하나도 설정되지 않았습니다. ANTHROPIC_API_KEY 또는 GEMINI_API_KEY 가 필요합니다.",
    latency_ms: 0,
  };
}

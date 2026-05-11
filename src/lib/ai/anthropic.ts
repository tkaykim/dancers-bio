import "server-only";

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/**
 * Lazily-initialized Anthropic SDK client.
 * Throws a friendly error when ANTHROPIC_API_KEY is not configured so
 * server actions can surface it to the UI.
 */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY가 설정되어 있지 않습니다. 관리자에게 문의하세요.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Default model — claude sonnet 4.5 (latest stable as of 2026-05).
// Pinned in one place so it's easy to swap during eval.
export const PORTFOLIO_EXTRACTOR_MODEL = "claude-sonnet-4-5-20250929";

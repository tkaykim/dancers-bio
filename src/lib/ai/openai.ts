import "server-only";

import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Lazily-initialized OpenAI SDK client.
 * Throws a friendly Korean error when OPENAI_API_KEY is not configured.
 */
export function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되어 있지 않습니다. 관리자에게 문의하세요.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

// Default model. gpt-4o-mini supports PDF input via the Responses API and
// handles Korean well at low cost. Pinned here so eval can swap it in one place.
export const PORTFOLIO_EXTRACTOR_MODEL = "gpt-4o-mini";

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  projectIngestionJsonSchema,
  projectIngestionSchema,
  type ProjectIngestionData,
} from "../schema";
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, HEALTH_PING_PROMPT } from "../prompts";

export const ANTHROPIC_MODEL = "claude-haiku-4-5";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function anthropicHealth(): Promise<{
  ok: boolean;
  error?: string;
  latency_ms?: number;
}> {
  const client = getClient();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY 미설정" };
  const t0 = Date.now();
  try {
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: HEALTH_PING_PROMPT }],
    });
    const text =
      resp.content.find((c) => c.type === "text")?.text?.trim() ?? "";
    return { ok: text.length > 0, latency_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// JSON 응답을 안정적으로 받기 위해 tool_use 강제.
const EXTRACT_TOOL_NAME = "extract_project";

export async function anthropicParseProject(rawText: string): Promise<{
  ok: true;
  data: ProjectIngestionData;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number };
} | {
  ok: false;
  error: string;
  model: string;
}> {
  const client = getClient();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY 미설정", model: ANTHROPIC_MODEL };
  try {
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: EXTRACT_TOOL_NAME,
          description:
            "외부 캐스팅 공고 텍스트에서 구조화된 데이터를 추출.",
          // Anthropic input_schema 는 JSON Schema 그대로 수용.
          input_schema: projectIngestionJsonSchema as unknown as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: EXTRACT_TOOL_NAME },
      messages: [
        { role: "user", content: USER_PROMPT_TEMPLATE(rawText) },
      ],
    });
    const toolUse = resp.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );
    if (!toolUse) {
      return {
        ok: false,
        error: "응답에서 tool_use 블록을 찾지 못했습니다.",
        model: ANTHROPIC_MODEL,
      };
    }
    const parsed = projectIngestionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return {
        ok: false,
        error: `스키마 불일치: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        model: ANTHROPIC_MODEL,
      };
    }
    return {
      ok: true,
      data: parsed.data,
      model: ANTHROPIC_MODEL,
      usage: {
        input_tokens: resp.usage?.input_tokens,
        output_tokens: resp.usage?.output_tokens,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      model: ANTHROPIC_MODEL,
    };
  }
}

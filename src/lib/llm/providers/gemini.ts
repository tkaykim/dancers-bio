import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import {
  projectIngestionSchema,
  type ProjectIngestionData,
  SESSION_TYPES,
  PAY_TYPES,
} from "../schema";
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, HEALTH_PING_PROMPT } from "../prompts";

export const GEMINI_MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

export function geminiConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export async function geminiHealth(): Promise<{
  ok: boolean;
  error?: string;
  latency_ms?: number;
}> {
  const client = getClient();
  if (!client) return { ok: false, error: "GEMINI_API_KEY 미설정" };
  const t0 = Date.now();
  try {
    const resp = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: HEALTH_PING_PROMPT,
      config: { maxOutputTokens: 16 },
    });
    const text = (resp.text ?? "").trim();
    return { ok: text.length > 0, latency_ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Gemini responseSchema 는 OpenAPI flavor. nullable, enum 표현이 약간 다르다.
// 별도로 작성. (단순 union "type": ["string","null"] 형식은 지원하지 않음.)
const geminiSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, maxLength: "120" },
    description: { type: Type.STRING, maxLength: "2000" },
    posted_by_label: { type: Type.STRING, nullable: true },
    region_text: { type: Type.STRING, nullable: true },
    pay_amount: { type: Type.INTEGER, nullable: true },
    pay_type: {
      type: Type.STRING,
      nullable: true,
      enum: PAY_TYPES as unknown as string[],
    },
    recruitment_count: { type: Type.INTEGER },
    application_deadline_iso: { type: Type.STRING, nullable: true },
    sessions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          session_type: {
            type: Type.STRING,
            enum: SESSION_TYPES as unknown as string[],
          },
          starts_at_iso: { type: Type.STRING },
          ends_at_iso: { type: Type.STRING, nullable: true },
          location_name: { type: Type.STRING, nullable: true },
          role_notes: { type: Type.STRING, nullable: true },
        },
        required: ["session_type", "starts_at_iso"],
      },
    },
    contact: { type: Type.STRING, nullable: true },
    visibility_hint: { type: Type.STRING, enum: ["public", "private"] },
    fit_warning: { type: Type.STRING, nullable: true },
  },
  required: [
    "title",
    "description",
    "recruitment_count",
    "sessions",
    "visibility_hint",
  ],
};

export async function geminiParseProject(rawText: string): Promise<{
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
  if (!client) return { ok: false, error: "GEMINI_API_KEY 미설정", model: GEMINI_MODEL };
  try {
    const resp = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: USER_PROMPT_TEMPLATE(rawText),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: geminiSchema as any,
        maxOutputTokens: 2048,
      },
    });
    const text = resp.text ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `JSON 파싱 실패: ${text.slice(0, 200)}`,
        model: GEMINI_MODEL,
      };
    }
    const parsed = projectIngestionSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: `스키마 불일치: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        model: GEMINI_MODEL,
      };
    }
    return {
      ok: true,
      data: parsed.data,
      model: GEMINI_MODEL,
      usage: {
        input_tokens: resp.usageMetadata?.promptTokenCount ?? undefined,
        output_tokens: resp.usageMetadata?.candidatesTokenCount ?? undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      model: GEMINI_MODEL,
    };
  }
}

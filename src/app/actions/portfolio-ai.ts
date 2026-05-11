"use server";

import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractPortfolio,
  type ParsedPortfolio,
} from "@/lib/ai/portfolio-extractor";
import {
  PORTFOLIO_UPLOADS_BUCKET,
  isValidPortfolioStoragePath,
  MAX_PORTFOLIO_PDF_BYTES,
} from "@/lib/storage/portfolio-uploads";
import type { ActionResult } from "./auth";

const RATE_LIMIT_MINUTES = 10;
const DAILY_LIMIT = 5;
const MAX_TEXT_CHARS = 50_000;

export type ParsePortfolioInput =
  | { kind: "pdf"; storagePath: string }
  | { kind: "text"; text: string };

export async function parsePortfolioAction(
  input: ParsePortfolioInput,
): Promise<ActionResult<ParsedPortfolio>> {
  const profile = await requireProfile();

  // Validate input shape early
  if (input.kind === "text") {
    const text = input.text?.trim() ?? "";
    if (!text) {
      return { ok: false, error: "텍스트를 입력해 주세요." };
    }
    if (text.length > MAX_TEXT_CHARS) {
      return {
        ok: false,
        error: `텍스트는 ${MAX_TEXT_CHARS.toLocaleString()}자 이하여야 합니다.`,
      };
    }
  } else if (input.kind === "pdf") {
    if (!isValidPortfolioStoragePath(input.storagePath, profile.id)) {
      return { ok: false, error: "잘못된 파일 경로입니다." };
    }
  } else {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const admin = createAdminClient();

  // Rate limit (admins exempt)
  if (!profile.is_admin) {
    const tenMinAgo = new Date(
      Date.now() - RATE_LIMIT_MINUTES * 60_000,
    ).toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ count: recentCount }, { count: dailyCount }] = await Promise.all([
      admin
        .from("ai_extraction_log")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .gte("created_at", tenMinAgo),
      admin
        .from("ai_extraction_log")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .gte("created_at", todayStart.toISOString()),
    ]);

    if ((recentCount ?? 0) > 0) {
      return {
        ok: false,
        error: `잠시 후 다시 시도해 주세요. (${RATE_LIMIT_MINUTES}분 이내 재시도 제한)`,
      };
    }
    if ((dailyCount ?? 0) >= DAILY_LIMIT) {
      return {
        ok: false,
        error: `오늘의 분석 한도(${DAILY_LIMIT}회)를 모두 사용했습니다.`,
      };
    }
  }

  let pages: number | null = null;
  let extractInput:
    | { kind: "pdf"; base64: string }
    | { kind: "text"; text: string };

  try {
    if (input.kind === "pdf") {
      const { data, error } = await admin.storage
        .from(PORTFOLIO_UPLOADS_BUCKET)
        .download(input.storagePath);
      if (error || !data) {
        return {
          ok: false,
          error: `PDF를 읽지 못했습니다: ${error?.message ?? "알 수 없는 오류"}`,
        };
      }
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.byteLength > MAX_PORTFOLIO_PDF_BYTES) {
        return { ok: false, error: "PDF는 10MB 이하만 업로드할 수 있습니다." };
      }
      extractInput = { kind: "pdf", base64: buf.toString("base64") };
      // Rough page estimate (PDFs vary; not critical for logging)
      pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length || null;
    } else {
      extractInput = { kind: "text", text: input.text };
    }

    const result = await extractPortfolio(extractInput);

    // Log success (best-effort; never throw)
    await admin
      .from("ai_extraction_log")
      .insert({
        profile_id: profile.id,
        kind: input.kind,
        pages,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        saved_count: result.data.careers.length,
        warnings_count: result.data.warnings.length,
      })
      .then(() => undefined, () => undefined);

    return { ok: true, data: result.data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    // Log failure
    await admin
      .from("ai_extraction_log")
      .insert({
        profile_id: profile.id,
        kind: input.kind,
        pages,
        error: message.slice(0, 500),
      })
      .then(() => undefined, () => undefined);
    return { ok: false, error: message };
  } finally {
    // Always remove uploaded PDF — we don't store user portfolios
    if (input.kind === "pdf") {
      await admin.storage
        .from(PORTFOLIO_UPLOADS_BUCKET)
        .remove([input.storagePath])
        .catch(() => undefined);
    }
  }
}

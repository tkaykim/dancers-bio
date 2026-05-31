import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProjectWithFallback, type LlmProvider } from "@/lib/llm";

/**
 * 외부 크롤러용 프로젝트 공고 인제스트 webhook.
 *
 * 흐름:
 *   외부 크롤러 → POST /api/ingest/project (공유 secret 인증)
 *     → 각 item.source_raw 를 LLM 으로 파싱 (parseProjectWithFallback)
 *     → project_ingestions 에 status='draft' 로 적재 (created_by = 시스템 admin)
 *     → 운영자가 기존 검수 UI(/admin/projects/import)에서 검토 후 발행/병합/기각
 *
 * 즉, 이 엔드포인트는 admin 의 "텍스트 붙여넣기"(createIngestionAction)를
 * 외부 자동화로 대체하는 입구일 뿐, 발행은 사람이 한다.
 *
 * 인증: body.secret === process.env.INGEST_WEBHOOK_SECRET.
 *   TODO: 운영 배포 전에 INGEST_WEBHOOK_SECRET env 설정 필요.
 *         미설정 시 503 으로 안전하게 차단된다 (오픈 인제스트 방지).
 *
 * Request body (JSON):
 *   { secret: string; items: Array<{ source_url?: string; source_raw: string }> }
 * Response (JSON):
 *   { ingested: number; failed: number }   // ingested = insert 성공한 행 수
 */

const isProvider = (s: unknown): s is LlmProvider =>
  s === "anthropic" || s === "gemini";

type IngestItem = { source_url?: string; source_raw?: string };

export async function POST(req: Request) {
  const secret = process.env.INGEST_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INGEST_WEBHOOK_SECRET 미설정" },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      secret?: string;
      items?: IngestItem[];
    } | null;

    if (!body || body.secret !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ ingested: 0, failed: 0 });
    }

    const admin = createAdminClient();

    // 기본 LLM provider 결정 (app_config, 없으면 gemini).
    let provider: LlmProvider = "gemini";
    const { data: cfg } = await admin
      .from("app_config")
      .select("default_llm_provider")
      .eq("id", true)
      .maybeSingle();
    if (cfg?.default_llm_provider && isProvider(cfg.default_llm_provider)) {
      provider = cfg.default_llm_provider;
    }

    // created_by 는 NOT NULL 일 수 있어 시스템 admin 프로필 id 로 채운다.
    const { data: sysAdmin } = await admin
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    const createdBy = (sysAdmin?.id as string | undefined) ?? null;

    let ingested = 0;
    let failed = 0;

    for (const item of items) {
      const sourceRaw = (item?.source_raw ?? "").toString().trim();
      const sourceUrl = item?.source_url
        ? item.source_url.toString().trim() || null
        : null;

      // 너무 짧은 본문은 파싱 가치가 없어 skip (createIngestionAction 과 동일 기준).
      if (sourceRaw.length < 10) {
        failed++;
        continue;
      }

      const result = await parseProjectWithFallback(sourceRaw, provider);

      const { error } = await admin.from("project_ingestions").insert({
        created_by: createdBy,
        source_url: sourceUrl,
        source_raw: sourceRaw,
        parsed_json: result.ok
          ? (result.data as unknown as Record<string, unknown>)
          : null,
        parse_error: result.ok ? null : result.error,
        llm_provider: result.provider,
        llm_model: result.model,
        status: "draft",
      });

      if (error) failed++;
      else ingested++;
    }

    return NextResponse.json({ ingested, failed });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

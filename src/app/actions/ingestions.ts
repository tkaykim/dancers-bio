"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import {
  parseProject,
  parseProjectWithFallback,
  providerConfigured,
  providerHealth,
  LLM_PROVIDER_MODELS,
  type LlmProvider,
} from "@/lib/llm";
import type { ProjectIngestionData } from "@/lib/llm/schema";

function isProvider(s: unknown): s is LlmProvider {
  return s === "anthropic" || s === "gemini";
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

// 1. 텍스트 붙여넣기 → 파싱 시도 → ingestion row 생성. 검토 페이지 id 반환.
export async function createIngestionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();

  const raw = (formData.get("source_raw") ?? "").toString().trim();
  if (raw.length < 10) {
    return { ok: false, error: "공고 텍스트가 너무 짧습니다." };
  }
  if (raw.length > 20000) {
    return { ok: false, error: "공고 텍스트가 너무 깁니다 (20,000자 이내)." };
  }

  const sourceUrl = strOrNull(formData, "source_url");
  const overrideProvider = formData.get("provider");
  const supabase = await createClient();

  // 기본 provider 결정
  let provider: LlmProvider = "gemini";
  if (isProvider(overrideProvider)) {
    provider = overrideProvider;
  } else {
    const { data: cfg } = await supabase
      .from("app_config")
      .select("default_llm_provider")
      .eq("id", true)
      .maybeSingle();
    if (cfg?.default_llm_provider && isProvider(cfg.default_llm_provider)) {
      provider = cfg.default_llm_provider;
    }
  }

  const result = await parseProjectWithFallback(raw, provider);

  const { data: ingestion, error } = await supabase
    .from("project_ingestions")
    .insert({
      created_by: admin.id,
      source_url: sourceUrl,
      source_raw: raw,
      parsed_json: result.ok ? (result.data as unknown as Record<string, unknown>) : null,
      parse_error: result.ok ? null : result.error,
      llm_provider: result.provider,
      llm_model: result.model,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/projects/import");
  return { ok: true, data: { id: ingestion!.id as string } };
}

// 2. 검토 페이지에서 admin 이 파싱을 다시 실행 (provider 변경 등).
export async function reparseIngestionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const id = (formData.get("id") ?? "").toString();
  const overrideProvider = formData.get("provider");
  if (!id) return { ok: false, error: "잘못된 요청." };

  const supabase = await createClient();
  const { data: ing } = await supabase
    .from("project_ingestions")
    .select("source_raw")
    .eq("id", id)
    .maybeSingle();
  if (!ing) return { ok: false, error: "ingestion 을 찾을 수 없습니다." };

  let provider: LlmProvider = "gemini";
  if (isProvider(overrideProvider)) provider = overrideProvider;
  else {
    const { data: cfg } = await supabase
      .from("app_config")
      .select("default_llm_provider")
      .eq("id", true)
      .maybeSingle();
    if (cfg?.default_llm_provider && isProvider(cfg.default_llm_provider))
      provider = cfg.default_llm_provider;
  }

  const result = await parseProject(ing.source_raw as string, provider);
  const { error } = await supabase
    .from("project_ingestions")
    .update({
      parsed_json: result.ok ? (result.data as unknown as Record<string, unknown>) : null,
      parse_error: result.ok ? null : result.error,
      llm_provider: result.provider,
      llm_model: result.model,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/projects/import/${id}`);
  return { ok: true, data: { id } };
}

// 3. 중복 후보 검색 (source_url + title trigram).
export async function findDuplicateCandidates(
  ingestionId: string,
): Promise<
  Array<{
    id: string;
    short_code: string;
    title: string;
    status: string;
    created_at: string;
    similarity: number;
    match_kind: "source_url" | "title";
  }>
> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: ing } = await supabase
    .from("project_ingestions")
    .select("source_url, parsed_json")
    .eq("id", ingestionId)
    .maybeSingle();
  if (!ing) return [];

  const candidates: Array<{
    id: string;
    short_code: string;
    title: string;
    status: string;
    created_at: string;
    similarity: number;
    match_kind: "source_url" | "title";
  }> = [];

  const sourceUrl = (ing.source_url as string | null) ?? null;
  if (sourceUrl) {
    const { data } = await supabase
      .from("projects")
      .select("id, short_code, title, status, created_at")
      .eq("source_url", sourceUrl)
      .is("deleted_at", null)
      .limit(3);
    for (const p of data ?? []) {
      candidates.push({
        id: p.id as string,
        short_code: p.short_code as string,
        title: p.title as string,
        status: p.status as string,
        created_at: p.created_at as string,
        similarity: 1,
        match_kind: "source_url",
      });
    }
  }

  // parsed_json.title 기반 trigram 검색
  const parsed = (ing.parsed_json as ProjectIngestionData | null) ?? null;
  const title = parsed?.title?.trim() ?? "";
  if (title.length >= 3) {
    // RPC 가 없으니 raw SQL 비슷한 패턴으로: pg_trgm % 연산자 사용은 supabase-js 에서 안 됨.
    // similarity() 함수도 함수 호출이라 select 만 가능. 대신 ilike 로 1차 거른 후 후보 5개.
    // 충분한 정확도를 위해서는 후속 마이그레이션에서 RPC 추가 권장. v1 은 ilike 로 시작.
    const pattern = `%${title.slice(0, 30).replace(/[\\%_]/g, "")}%`;
    const { data } = await supabase
      .from("projects")
      .select("id, short_code, title, status, created_at")
      .ilike("title", pattern)
      .is("deleted_at", null)
      .limit(5);
    for (const p of data ?? []) {
      if (candidates.some((c) => c.id === p.id)) continue;
      candidates.push({
        id: p.id as string,
        short_code: p.short_code as string,
        title: p.title as string,
        status: p.status as string,
        created_at: p.created_at as string,
        similarity: 0.5,
        match_kind: "title",
      });
    }
  }

  return candidates.slice(0, 5);
}

// 4. 발행 — parsed_json 을 projects 행으로 변환해 insert + ingestion 상태 published 로.
export async function publishIngestionAction(
  formData: FormData,
): Promise<ActionResult<{ project_id: string; short_code: string }>> {
  const admin = await requireAdmin();
  const id = (formData.get("id") ?? "").toString();
  if (!id) return { ok: false, error: "잘못된 요청." };

  const supabase = await createClient();
  const { data: ing } = await supabase
    .from("project_ingestions")
    .select("id, source_url, parsed_json, status")
    .eq("id", id)
    .maybeSingle();
  if (!ing) return { ok: false, error: "ingestion 을 찾을 수 없습니다." };
  if (ing.status !== "draft") return { ok: false, error: "이미 처리된 ingestion 입니다." };
  if (!ing.parsed_json) return { ok: false, error: "파싱 결과가 없습니다. 다시 파싱하세요." };

  const parsed = ing.parsed_json as unknown as ProjectIngestionData;

  // 발행 시 admin 이 수정한 값을 form 에서도 받음 (override).
  const titleOverride = strOrNull(formData, "title");
  const descriptionOverride = strOrNull(formData, "description");
  const postedByOverride = strOrNull(formData, "posted_by_label");
  const regionOverride = strOrNull(formData, "region_text");
  const visibilityOverride = strOrNull(formData, "visibility");
  const recruitmentOverride = strOrNull(formData, "recruitment_count");
  const payAmountOverride = strOrNull(formData, "pay_amount");
  const payTypeOverride = strOrNull(formData, "pay_type");
  const deadlineOverride = strOrNull(formData, "application_deadline_iso");

  const projectRow = {
    owner_id: admin.id,
    title: titleOverride ?? parsed.title,
    description: descriptionOverride ?? parsed.description,
    visibility:
      (visibilityOverride as "public" | "private" | null) ??
      parsed.visibility_hint ??
      "public",
    status: "open" as const,
    region_text: regionOverride ?? parsed.region_text ?? null,
    pay_amount: payAmountOverride
      ? Number(payAmountOverride.replace(/[^\d]/g, ""))
      : parsed.pay_amount ?? null,
    pay_type:
      (payTypeOverride as "per_session" | "total" | "negotiable" | null) ??
      parsed.pay_type ??
      null,
    recruitment_count: recruitmentOverride
      ? Number(recruitmentOverride)
      : parsed.recruitment_count ?? 1,
    allow_team_apply: false,
    application_deadline:
      deadlineOverride ?? parsed.application_deadline_iso ?? null,
    posted_by_label: postedByOverride ?? parsed.posted_by_label ?? null,
    source_url: (ing.source_url as string | null) ?? null,
    ingestion_id: ing.id as string,
  };

  const { data: project, error } = await supabase
    .from("projects")
    .insert(projectRow)
    .select("id, short_code")
    .single();
  if (error) {
    if (error.code === "42501")
      return { ok: false, error: "프로젝트 발행 권한이 없습니다." };
    return { ok: false, error: error.message };
  }

  // 세션 insert
  const sessions = (parsed.sessions ?? []).map((s, i) => ({
    project_id: project!.id as string,
    session_type: s.session_type,
    starts_at: s.starts_at_iso,
    ends_at: s.ends_at_iso ?? null,
    location_name: s.location_name ?? null,
    role_notes: s.role_notes ?? null,
    sort_order: i,
  }));
  if (sessions.length > 0) {
    const LABEL_KO: Record<string, string> = {
      rehearsal: "연습",
      main: "본무대",
      filming: "촬영",
      fitting: "피팅",
      meeting: "미팅",
      other: "일정",
    };
    const schedRows = sessions.map((s) => ({
      project_id: s.project_id,
      label: LABEL_KO[s.session_type] ?? "일정",
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      location: s.location_name,
      role_notes: s.role_notes,
      session_type: s.session_type,
      status: "confirmed",
      collect_availability: false,
      sort_order: s.sort_order,
    }));
    const { error: sErr } = await supabase
      .from("project_schedules")
      .insert(schedRows);
    if (sErr) {
      // project 는 만들어졌으니 진행하되 경고
      return {
        ok: true,
        data: {
          project_id: project!.id as string,
          short_code: project!.short_code as string,
        },
      };
    }
  }

  await supabase
    .from("project_ingestions")
    .update({
      status: "published",
      published_project_id: project!.id as string,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/feed");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/projects/import");
  return {
    ok: true,
    data: {
      project_id: project!.id as string,
      short_code: project!.short_code as string,
    },
  };
}

export async function mergeIngestionAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = (formData.get("id") ?? "").toString();
  const target = (formData.get("merge_into_project_id") ?? "").toString();
  if (!id || !target) return { ok: false, error: "잘못된 요청." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_ingestions")
    .update({
      status: "merged",
      merged_into_project_id: target,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/projects/import");
  return { ok: true };
}

export async function dismissIngestionAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = (formData.get("id") ?? "").toString();
  if (!id) return { ok: false, error: "잘못된 요청." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_ingestions")
    .update({
      status: "dismissed",
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/projects/import");
  return { ok: true };
}

// app_config: default provider 설정
export async function setDefaultLlmProviderAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const provider = (formData.get("provider") ?? "").toString();
  if (!isProvider(provider)) return { ok: false, error: "잘못된 provider." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_config")
    .update({
      default_llm_provider: provider,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/llm");
  return { ok: true };
}

// LLM 헬스체크 + 1회 테스트 파싱
export async function llmStatusAction(): Promise<
  ActionResult<{
    anthropic: {
      configured: boolean;
      model: string;
      health: { ok: boolean; error?: string; latency_ms?: number };
    };
    gemini: {
      configured: boolean;
      model: string;
      health: { ok: boolean; error?: string; latency_ms?: number };
    };
    default_provider: LlmProvider;
  }>
> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: cfg } = await supabase
    .from("app_config")
    .select("default_llm_provider")
    .eq("id", true)
    .maybeSingle();

  const aCfg = providerConfigured("anthropic");
  const gCfg = providerConfigured("gemini");

  const [aH, gH] = await Promise.all([
    aCfg ? providerHealth("anthropic") : Promise.resolve({ ok: false, error: "키 미설정" }),
    gCfg ? providerHealth("gemini") : Promise.resolve({ ok: false, error: "키 미설정" }),
  ]);

  return {
    ok: true,
    data: {
      anthropic: {
        configured: aCfg,
        model: LLM_PROVIDER_MODELS.anthropic,
        health: aH,
      },
      gemini: {
        configured: gCfg,
        model: LLM_PROVIDER_MODELS.gemini,
        health: gH,
      },
      default_provider:
        (cfg?.default_llm_provider as LlmProvider | undefined) ?? "gemini",
    },
  };
}

export async function llmTestParseAction(
  formData: FormData,
): Promise<
  ActionResult<{
    provider: LlmProvider;
    model: string;
    latency_ms: number;
    data?: ProjectIngestionData;
    error?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  }>
> {
  await requireAdmin();
  const raw = (formData.get("source_raw") ?? "").toString().trim();
  const providerStr = (formData.get("provider") ?? "").toString();
  if (!raw) return { ok: false, error: "텍스트가 비었습니다." };
  if (!isProvider(providerStr)) return { ok: false, error: "provider 선택 필요." };
  const result = await parseProject(raw, providerStr);
  if (result.ok) {
    return {
      ok: true,
      data: {
        provider: result.provider,
        model: result.model,
        latency_ms: result.latency_ms,
        data: result.data,
        usage: result.usage,
      },
    };
  }
  return {
    ok: true,
    data: {
      provider: result.provider,
      model: result.model,
      latency_ms: result.latency_ms,
      error: result.error,
    },
  };
}

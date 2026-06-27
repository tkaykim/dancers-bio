"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendProjectMatchNotifications } from "@/lib/notify/project-match";
import {
  canManageProject,
  isProjectOwnerOrAdmin,
  requireCreator,
  requireUser,
} from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  agreedPaySchema,
  projectSchema,
  projectUpdateSchema,
} from "@/lib/validation/projects";
import type { ActionResult } from "./auth";

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

function localDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; short_code: string }>> {
  // 프로젝트 생성 권한(can_create_project) 또는 슈퍼관리자. owner = 생성자 본인.
  const creator = await requireCreator();

  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    visibility: (formData.get("visibility") ?? "public").toString(),
    category: strOrNull(formData, "category"),
    genre_id: strOrNull(formData, "genre_id"),
    region_id: strOrNull(formData, "region_id"),
    region_text: strOrNull(formData, "region_text"),
    pay_amount: strOrNull(formData, "pay_amount"),
    pay_type: strOrNull(formData, "pay_type"),
    recruitment_count: strOrNull(formData, "recruitment_count") ?? "1",
    application_deadline: localDateTimeToIso(strOrNull(formData, "application_deadline")),
    publish_now:
      formData.get("publish_now") === "on" ||
      formData.get("publish_now") === "true",
    is_standing_pool:
      formData.get("is_standing_pool") === "on" ||
      formData.get("is_standing_pool") === "true",
    collect_applicant_fee:
      formData.get("collect_applicant_fee") === "on" ||
      formData.get("collect_applicant_fee") === "true",
    posted_by_label: strOrNull(formData, "posted_by_label"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();

  // 상시 섭외풀: 마감 없음. true 면 입력된 마감일을 무시하고 null 강제.
  const isStandingPool = parsed.data.is_standing_pool;
  const applicationDeadline = isStandingPool
    ? null
    : parsed.data.application_deadline ?? null;

  // owner = 생성자 본인. allow_team_apply는 항상 false.
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      owner_id: creator.id,
      title: parsed.data.title,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      status: parsed.data.publish_now ? "open" : "draft",
      category: parsed.data.category ?? null,
      genre_id: parsed.data.genre_id ?? null,
      region_id: parsed.data.region_id ?? null,
      region_text: parsed.data.region_text ?? null,
      pay_amount: parsed.data.pay_amount ?? null,
      pay_type: parsed.data.pay_type ?? null,
      recruitment_count: parsed.data.recruitment_count,
      allow_team_apply: false,
      application_deadline: applicationDeadline,
      is_standing_pool: isStandingPool,
      collect_applicant_fee: parsed.data.collect_applicant_fee,
      posted_by_label: parsed.data.posted_by_label ?? null,
    })
    .select("id, short_code")
    .single();

  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        error: "프로젝트 개설 권한이 없습니다. 관리자에게 문의해 주세요.",
      };
    }
    return { ok: false, error: error.message };
  }

  // 신규 프로젝트는 기본 모집채널을 자동 생성한다. 기존 short_code 링크는 그대로
  // 유지하고, 채널별 배포가 필요할 때 /c/[share_code] 링크를 사용한다.
  await supabase.from("recruitment_channels").insert({
    project_id: project.id,
    name: "기본 모집",
    channel_type: "general",
    manager_label: "프로젝트 관리자",
    sort_order: 0,
    created_by: creator.id,
  });

  // 공개로 바로 게시되는 공고면, 핏 맞는(장르 일치) 댄서에게 매칭 알림(인앱+웹푸시).
  // 응답을 막지 않도록 after()로 응답 후 비동기 실행. 멱등 로그로 중복발송 방지.
  if (parsed.data.publish_now && parsed.data.visibility === "public") {
    const newProjectId = project.id as string;
    after(() => sendProjectMatchNotifications(newProjectId));
  }

  // 일정 (project_schedules) — 비치명적. 모든 일정이 가능여부 조사 대상.
  const schedCount = Number(formData.get("schedules_count") ?? 0);
  if (schedCount > 0) {
    const toIso = (v: string | null) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };
    const schedRows: Array<{
      project_id: string;
      label: string;
      starts_at: string | null;
      ends_at: string | null;
      location: string | null;
      note: string | null;
      time_tbd: boolean;
      sort_order: number;
      created_by: string;
    }> = [];
    for (let i = 0; i < schedCount; i++) {
      const label = strOrNull(formData, `schedules[${i}][label]`);
      if (!label) continue;
      const timeTbd = formData.get(`schedules[${i}][time_tbd]`) === "true";
      schedRows.push({
        project_id: project.id as string,
        label,
        starts_at: toIso(strOrNull(formData, `schedules[${i}][starts_at]`)),
        ends_at: timeTbd
          ? null
          : toIso(strOrNull(formData, `schedules[${i}][ends_at]`)),
        location: strOrNull(formData, `schedules[${i}][location]`),
        note: strOrNull(formData, `schedules[${i}][note]`),
        time_tbd: timeTbd,
        sort_order: i,
        created_by: creator.id,
      });
    }
    if (schedRows.length > 0) {
      await supabase.from("project_schedules").insert(schedRows);
    }
  }

  // 참고자료 첨부 (클라이언트가 storage에 올린 메타데이터 JSON). 비치명적.
  const attachmentsRaw = strOrNull(formData, "attachments");
  if (attachmentsRaw) {
    try {
      const items = JSON.parse(attachmentsRaw) as Array<{
        path?: string;
        name?: string;
        size?: number;
        mime?: string;
      }>;
      const rows = items
        .filter((a) => a && typeof a.path === "string" && typeof a.name === "string")
        .slice(0, 10)
        .map((a, i) => ({
          project_id: project.id,
          file_name: (a.name as string).slice(0, 200),
          storage_path: a.path as string,
          mime_type: a.mime ?? null,
          size_bytes: typeof a.size === "number" ? a.size : null,
          sort_order: i,
          created_by: creator.id,
        }));
      if (rows.length > 0) {
        await supabase.from("project_attachments").insert(rows);
      }
    } catch {
      // malformed JSON — 무시 (프로젝트 자체는 정상 생성)
    }
  }

  revalidatePath("/feed");
  revalidatePath("/me");
  return {
    ok: true,
    data: {
      id: project.id as string,
      short_code: project.short_code as string,
    },
  };
}

export async function closeProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(id)))
    return { ok: false, error: "이 프로젝트를 관리할 권한이 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "closed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/admin/projects");
  revalidatePath("/feed");
  return { ok: true };
}

export async function deleteProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "잘못된 요청입니다." };
  // 삭제는 소유자·슈퍼관리자만. 공동관리자는 삭제 불가.
  if (!(await isProjectOwnerOrAdmin(id)))
    return { ok: false, error: "삭제 권한이 없습니다. (소유자·관리자만 가능)" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/admin/projects");
  revalidatePath("/feed");
  return { ok: true };
}

export async function updateProjectAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const parsed = projectUpdateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description"),
    visibility: (formData.get("visibility") ?? "public").toString(),
    category: strOrNull(formData, "category"),
    genre_id: strOrNull(formData, "genre_id"),
    region_id: strOrNull(formData, "region_id"),
    region_text: strOrNull(formData, "region_text"),
    pay_amount: strOrNull(formData, "pay_amount"),
    pay_type: strOrNull(formData, "pay_type"),
    recruitment_count: strOrNull(formData, "recruitment_count") ?? "1",
    application_deadline: localDateTimeToIso(
      strOrNull(formData, "application_deadline"),
    ),
    collect_applicant_fee:
      formData.get("collect_applicant_fee") === "on" ||
      formData.get("collect_applicant_fee") === "true",
    posted_by_label: strOrNull(formData, "posted_by_label"),
    status: strOrNull(formData, "status") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  // 소유자·슈퍼관리자·공동관리자만 수정 가능.
  if (!(await canManageProject(parsed.data.id)))
    return { ok: false, error: "이 프로젝트를 수정할 권한이 없습니다." };

  const supabase = await createClient();

  // Confirm exists & not soft-deleted.
  const { data: existing, error: selErr } = await supabase
    .from("projects")
    .select("id, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (!existing || existing.deleted_at)
    return { ok: false, error: "공고를 찾을 수 없습니다." };

  const updatePayload: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description,
    visibility: parsed.data.visibility,
    category: parsed.data.category ?? null,
    genre_id: parsed.data.genre_id ?? null,
    region_id: parsed.data.region_id ?? null,
    region_text: parsed.data.region_text ?? null,
    pay_amount: parsed.data.pay_amount ?? null,
    pay_type: parsed.data.pay_type ?? null,
    recruitment_count: parsed.data.recruitment_count,
    application_deadline: parsed.data.application_deadline ?? null,
    collect_applicant_fee: parsed.data.collect_applicant_fee,
    posted_by_label: parsed.data.posted_by_label ?? null,
  };
  if (parsed.data.status) updatePayload.status = parsed.data.status;

  const { error: updErr } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", parsed.data.id);
  if (updErr) {
    if (updErr.code === "42501")
      return { ok: false, error: "수정 권한이 없습니다." };
    return { ok: false, error: updErr.message };
  }

  // ⚠ 일정은 여기서 절대 건드리지 않는다(삭제·재삽입 금지).
  // 일정 추가/삭제는 지원자 콘솔의 일정 패널에서 개별 관리 → 이미 제출된 응답 보존.
  // (이전엔 수정 시 delete+재삽입이 응답을 날릴 위험이 있었음)

  revalidatePath(`/projects/${parsed.data.id}`);
  revalidatePath("/admin/projects");
  revalidatePath("/feed");
  return { ok: true, data: { id: parsed.data.id } };
}

export async function setAgreedPayAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const parsed = agreedPaySchema.safeParse({
    project_id: formData.get("project_id"),
    agreed_pay: strOrNull(formData, "agreed_pay") ?? null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "잘못된 입력값입니다.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ agreed_pay: parsed.data.agreed_pay ?? null })
    .eq("id", parsed.data.project_id);
  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "확정 비용 수정 권한이 없습니다." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

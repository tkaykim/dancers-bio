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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAllowedProjectFileMime,
  PROJECT_FILES_BUCKET,
  PROJECT_FILE_MAX_BYTES,
  PROJECT_FILE_MAX_COUNT,
  type ProjectAttachmentDraft,
} from "@/lib/storage/project-file";
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

// 폼은 단계 이름을 round_label_1..3 으로 보낸다. 최대 단계 수만큼 읽어 배열로 만든다.
function parseRoundLabels(formData: FormData): string[] {
  return [1, 2, 3].map((n) =>
    (formData.get(`round_label_${n}`) ?? "").toString().trim(),
  );
}

// 선택한 단계 수만큼만 저장하고, 전부 비어 있으면 NULL(기본 이름 사용).
function normalizeRoundLabels(
  labels: string[] | null | undefined,
  rounds: number,
): string[] | null {
  if (!labels) return null;
  const sliced = labels.slice(0, rounds).map((l) => l.trim());
  return sliced.some((l) => l.length > 0) ? sliced : null;
}

// 단계별 안내 메일 문구. 선택한 단계 수 범위만 저장하고, 빈 값은 키 자체를 뺀다.
// 전부 비면 NULL 이라 기본 문구가 그대로 나간다.
function parseRoundMessages(
  formData: FormData,
  rounds: number,
): Record<string, { body?: string; note?: string }> | null {
  const out: Record<string, { body?: string; note?: string }> = {};
  for (let n = 1; n <= rounds; n++) {
    const body = (formData.get(`round_body_${n}`) ?? "").toString().trim().slice(0, 1500);
    const note = (formData.get(`round_note_${n}`) ?? "").toString().trim().slice(0, 1500);
    if (!body && !note) continue;
    out[String(n)] = {
      ...(body ? { body } : {}),
      ...(note ? { note } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function localDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseProjectAttachments(
  raw: string | null,
  actorId: string,
  options: { allowExisting: boolean },
):
  | { ok: true; data: ProjectAttachmentDraft[] }
  | { ok: false; error: string } {
  if (!raw) return { ok: true, data: [] };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "첨부파일 정보를 읽을 수 없습니다." };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: "첨부파일 형식이 올바르지 않습니다." };
  }
  if (value.length > PROJECT_FILE_MAX_COUNT) {
    return {
      ok: false,
      error: `첨부파일은 최대 ${PROJECT_FILE_MAX_COUNT}개까지 등록할 수 있습니다.`,
    };
  }

  const seen = new Set<string>();
  const attachments: ProjectAttachmentDraft[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "첨부파일 형식이 올바르지 않습니다." };
    }

    const candidate = item as Partial<ProjectAttachmentDraft>;
    const id = typeof candidate.id === "string" ? candidate.id : undefined;
    if (id) {
      if (!options.allowExisting || !UUID_PATTERN.test(id) || seen.has(`id:${id}`)) {
        return { ok: false, error: "기존 첨부파일 정보가 올바르지 않습니다." };
      }
      seen.add(`id:${id}`);
      attachments.push({
        id,
        path: "",
        name: "",
        size: 0,
        mime: "",
      });
      continue;
    }

    const path = typeof candidate.path === "string" ? candidate.path : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const mime = typeof candidate.mime === "string" ? candidate.mime : "";
    const size = typeof candidate.size === "number" ? candidate.size : Number.NaN;
    const actorPrefix = `${actorId}/`;
    if (
      !path.startsWith(actorPrefix) ||
      path.length > 300 ||
      seen.has(`path:${path}`) ||
      !name ||
      name.length > 200 ||
      !Number.isInteger(size) ||
      size <= 0 ||
      size > PROJECT_FILE_MAX_BYTES ||
      !isAllowedProjectFileMime(mime)
    ) {
      return { ok: false, error: "새 첨부파일 정보가 올바르지 않습니다." };
    }

    seen.add(`path:${path}`);
    attachments.push({ path, name, size, mime });
  }

  return { ok: true, data: attachments };
}

export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; short_code: string }>> {
  // 프로젝트 생성 권한(can_create_project) 또는 슈퍼관리자. owner = 생성자 본인.
  const creator = await requireCreator();

  const attachmentInput = parseProjectAttachments(
    strOrNull(formData, "attachments"),
    creator.id,
    { allowExisting: false },
  );
  if (!attachmentInput.ok) return attachmentInput;

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
    collect_casting_details:
      formData.get("collect_casting_details") === "on" ||
      formData.get("collect_casting_details") === "true",
    selection_rounds: formData.get("selection_rounds") ?? 2,
    round_labels: parseRoundLabels(formData),
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
      collect_casting_details: parsed.data.collect_casting_details,
      selection_rounds: parsed.data.selection_rounds,
      round_labels: normalizeRoundLabels(
        parsed.data.round_labels,
        parsed.data.selection_rounds,
      ),
      round_messages: parseRoundMessages(formData, parsed.data.selection_rounds),
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
  if (attachmentInput.data.length > 0) {
    const rows = attachmentInput.data.map((attachment, index) => ({
      project_id: project.id,
      file_name: attachment.name,
      storage_path: attachment.path,
      mime_type: attachment.mime,
      size_bytes: attachment.size,
      sort_order: index,
      created_by: creator.id,
    }));
    await supabase.from("project_attachments").insert(rows);
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
  const actor = await requireUser();

  const attachmentInput = formData.has("attachments")
    ? parseProjectAttachments(strOrNull(formData, "attachments"), actor.id, {
        allowExisting: true,
      })
    : null;
  if (attachmentInput && !attachmentInput.ok) return attachmentInput;

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
    collect_casting_details:
      formData.get("collect_casting_details") === "on" ||
      formData.get("collect_casting_details") === "true",
    selection_rounds: formData.get("selection_rounds") ?? 2,
    round_labels: parseRoundLabels(formData),
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

  // 선발 단계 수를 이미 진행된 단계보다 낮추면 지원자 상태가 모순된다
  // (예: 2차 합격자가 있는데 1단계 공고로 바꾸면 passed_round=2 가 범위를 벗어남).
  // 클램프해서 조용히 강등시키지 않고 거부한다 — 합격 통보가 이미 나갔을 수 있다.
  const { data: deepest } = await supabase
    .from("applications")
    .select("passed_round")
    .eq("project_id", parsed.data.id)
    .eq("status", "accepted")
    .is("archived_at", null)
    .order("passed_round", { ascending: false })
    .limit(1)
    .maybeSingle();
  const deepestRound = (deepest?.passed_round as number | null) ?? 0;
  if (parsed.data.selection_rounds < deepestRound) {
    return {
      ok: false,
      error: `이미 ${deepestRound}단계까지 진행된 지원자가 있어 선발 단계를 ${parsed.data.selection_rounds}단계로 줄일 수 없습니다.`,
    };
  }

  let existingAttachments: Array<{ id: string; storage_path: string }> = [];
  if (attachmentInput?.ok) {
    const { data, error: attachmentSelectError } = await supabase
      .from("project_attachments")
      .select("id, storage_path")
      .eq("project_id", parsed.data.id);
    if (attachmentSelectError) {
      return { ok: false, error: attachmentSelectError.message };
    }

    existingAttachments = (data ?? []) as Array<{
      id: string;
      storage_path: string;
    }>;
    const existingIds = new Set(existingAttachments.map((item) => item.id));
    const includesForeignAttachment = attachmentInput.data.some(
      (attachment) => attachment.id && !existingIds.has(attachment.id),
    );
    if (includesForeignAttachment) {
      return { ok: false, error: "이 공고에 속하지 않은 첨부파일이 포함되어 있습니다." };
    }
  }

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
    collect_casting_details: parsed.data.collect_casting_details,
    selection_rounds: parsed.data.selection_rounds,
    round_labels: normalizeRoundLabels(
      parsed.data.round_labels,
      parsed.data.selection_rounds,
    ),
    round_messages: parseRoundMessages(formData, parsed.data.selection_rounds),
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

  if (attachmentInput?.ok) {
    const desiredExistingIds = attachmentInput.data
      .map((attachment) => attachment.id)
      .filter((id): id is string => Boolean(id));
    const desiredExistingSet = new Set(desiredExistingIds);
    const removedAttachments = existingAttachments.filter(
      (attachment) => !desiredExistingSet.has(attachment.id),
    );
    const newAttachmentRows = attachmentInput.data.flatMap(
      (attachment, index) =>
        attachment.id
          ? []
          : [
              {
                project_id: parsed.data.id,
                file_name: attachment.name,
                storage_path: attachment.path,
                mime_type: attachment.mime,
                size_bytes: attachment.size,
                sort_order: index,
                created_by: actor.id,
              },
            ],
    );
    if (newAttachmentRows.length > 0) {
      const { error: insertError } = await supabase
        .from("project_attachments")
        .insert(newAttachmentRows);
      if (insertError) return { ok: false, error: insertError.message };
    }

    const sortResults = await Promise.all(
      attachmentInput.data.flatMap((attachment, index) =>
        attachment.id
          ? [
              supabase
                .from("project_attachments")
                .update({ sort_order: index })
                .eq("id", attachment.id)
                .eq("project_id", parsed.data.id),
            ]
          : [],
      ),
    );
    const sortError = sortResults.find((result) => result.error)?.error;
    if (sortError) return { ok: false, error: sortError.message };

    if (removedAttachments.length > 0) {
      const { error: deleteError } = await supabase
        .from("project_attachments")
        .delete()
        .in(
          "id",
          removedAttachments.map((attachment) => attachment.id),
        );
      if (deleteError) return { ok: false, error: deleteError.message };
    }

    if (removedAttachments.length > 0) {
      const admin = createAdminClient();
      await admin.storage.from(PROJECT_FILES_BUCKET).remove(
        removedAttachments.map((attachment) => attachment.storage_path),
      );
    }
  }

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

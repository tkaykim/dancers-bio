"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanizeDbError } from "@/lib/db-errors";
import { sendApplicationRejectionEmail } from "@/lib/notify/rejection-mail";
import { NEEDS_DANCER_ERROR } from "@/lib/lite-constants";
import { isExpired } from "@/lib/utils/deadline";
import { castingApplicationDetailsSchema } from "@/lib/validation/application-details";
import type { ActionResult } from "./auth";

// Lite MVP: 1계정 = 1댄서 가정. team apply / manager-as-actor 분기 모두 제거.
// 항상 본인 own dancer (profile_id = user.id) 중 가장 오래된 1개로 INSERT.
// dancer가 없으면 NEEDS_DANCER sentinel 반환 → 클라이언트에서 onboarding으로 유도.
export async function applyToProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const project_id = formData.get("project_id");
  if (typeof project_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const cover_message = (formData.get("cover_message") ?? "").toString().trim();
  const requestedChannelId = (formData.get("recruitment_channel_id") ?? "")
    .toString()
    .trim();

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, status, visibility, deleted_at, application_deadline, is_standing_pool, collect_applicant_fee, collect_casting_details")
    .eq("id", project_id)
    .single();

  if (!project || project.deleted_at) {
    return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  }
  if (project.owner_id === user.id) {
    return { ok: false, error: "본인이 개설한 프로젝트에는 지원할 수 없습니다." };
  }
  if (project.status !== "open") {
    return { ok: false, error: "현재 모집이 닫혀 있습니다." };
  }
  // 마감일이 지난 공고는 status가 아직 open이어도 지원 불가 (방어적 — UI에서도 막지만 서버에서 재확인)
  // 상시 섭외풀은 마감이 없어 만료되지 않음.
  if (isExpired(project.application_deadline, project.is_standing_pool)) {
    return { ok: false, error: "지원 마감일이 지났습니다." };
  }

  let recruitment_channel_id: string | null = null;
  if (requestedChannelId) {
    const admin = createAdminClient();
    const { data: channel, error: channelError } = await admin
      .from("recruitment_channels")
      .select("id, project_id, legacy_project_id, status")
      .eq("id", requestedChannelId)
      .maybeSingle();
    if (channelError) {
      return { ok: false, error: "모집채널 확인에 실패했습니다." };
    }
    const channelProjectId = (channel?.project_id as string | null) ?? null;
    const legacyProjectId = (channel?.legacy_project_id as string | null) ?? null;
    const matchesProject =
      channelProjectId === project_id || legacyProjectId === project_id;
    if (!channel || !matchesProject || channel.status !== "active") {
      return { ok: false, error: "유효하지 않은 모집채널입니다." };
    }
    recruitment_channel_id = channel.id as string;
  }

  // 본인 own dancer 1개 조회 (multi-dancer는 Lite에서 미지원 — 가장 오래된 1개)
  const { data: ownDancers } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const dancerId = ownDancers?.[0]?.id as string | undefined;
  if (!dancerId) {
    return { ok: false, error: NEEDS_DANCER_ERROR };
  }

  // 단가(견적) — collect_applicant_fee 공고에서만 수집. 그 외엔 모두 null.
  // 금액+협의가능 → negotiable. 금액만 → quoted.
  const FEE_CURRENCIES = ["KRW", "USD", "JPY", "EUR"];
  let proposed_fee: number | null = null;
  let proposed_fee_currency = "KRW";
  let proposed_fee_unit: string | null = null;
  let fee_status: "quoted" | "negotiable" | "unsure" | null = null;
  if (project.collect_applicant_fee) {
    const negotiable = formData.get("fee_negotiable") === "1";
    const amountRaw = (formData.get("fee_amount") ?? "").toString().replace(/[^\d]/g, "");
    const amount = amountRaw ? Math.min(Number(amountRaw), 1_000_000_000) : null;
    const currencyRaw = (formData.get("fee_currency") ?? "KRW").toString();
    proposed_fee_currency = FEE_CURRENCIES.includes(currencyRaw) ? currencyRaw : "KRW";
    const unitRaw = (formData.get("fee_unit") ?? "").toString().trim();
    if (amount === null || amount <= 0) {
      return {
        ok: false,
        error: "러프한 금액이라도 제안 단가를 입력해 주세요.",
      };
    }
    proposed_fee = amount;
    proposed_fee_unit = unitRaw ? unitRaw.slice(0, 10) : null;
    fee_status = negotiable ? "negotiable" : "quoted";
  }

  let applicant_name: string | null = null;
  let birth_year: number | null = null;
  let height_cm: number | null = null;
  let primary_genre: string | null = null;
  let dance_video_url: string | null = null;
  let backup_dancer_history: string | null = null;
  let personal_profile_url: string | null = null;
  if (project.collect_casting_details) {
    const parsed = castingApplicationDetailsSchema.safeParse({
      applicant_name: formData.get("applicant_name"),
      birth_year: formData.get("birth_year"),
      height_cm: formData.get("height_cm"),
      primary_genre: formData.get("primary_genre"),
      dance_video_url: formData.get("dance_video_url"),
      backup_dancer_history: formData.get("backup_dancer_history"),
      personal_profile_url: formData.get("personal_profile_url"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ??
          "상세 지원 정보를 모두 입력해 주세요.",
      };
    }
    applicant_name = parsed.data.applicant_name;
    birth_year = parsed.data.birth_year;
    height_cm = parsed.data.height_cm;
    primary_genre = parsed.data.primary_genre;
    dance_video_url = parsed.data.dance_video_url;
    backup_dancer_history = parsed.data.backup_dancer_history;
    personal_profile_url = parsed.data.personal_profile_url;
  }

  const { error } = await supabase.from("applications").insert({
    project_id,
    applicant_id: user.id,
    dancer_id: dancerId,
    team_id: null,
    source: "apply" as const,
    status: "pending" as const,
    cover_message: cover_message || null,
    recruitment_channel_id,
    proposed_fee,
    proposed_fee_currency,
    proposed_fee_unit,
    fee_status,
    applicant_name,
    birth_year,
    height_cm,
    primary_genre,
    dance_video_url,
    backup_dancer_history,
    personal_profile_url,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 지원하셨습니다." };
    }
    if (error.code === "42501") {
      return { ok: false, error: "지원 권한이 없습니다." };
    }
    return { ok: false, error: humanizeDbError(error.message) };
  }

  revalidatePath(`/projects/${project_id}`);
  revalidatePath("/applications");
  return { ok: true };
}

export async function withdrawApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const application_id = formData.get("application_id");
  if (typeof application_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, status")
    .eq("id", application_id)
    .maybeSingle();
  if (!app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };
  if (app.status !== "pending") {
    return { ok: false, error: "이미 처리된 지원은 취소할 수 없습니다." };
  }
  if (app.applicant_id !== user.id) {
    return { ok: false, error: "본인 지원만 취소할 수 있습니다." };
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("id", application_id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/applications");
  return { ok: true };
}

// Lite: 수락 시 acceptedCount가 recruitment_count에 도달하면 quotaReached 신호를
// 반환해 클라이언트가 "마감할까요?" 확인 후 closeProjectAction을 직접 호출.
// 자동 마감 트리거는 마이그레이션 20260516_004에서 제거됨.
export async function decideApplicationAction(
  formData: FormData,
): Promise<ActionResult<{ quotaReached?: true; projectId?: string }>> {
  await requireUser();
  const application_id = formData.get("application_id");
  const decision = formData.get("decision");
  if (
    typeof application_id !== "string" ||
    (decision !== "accepted" && decision !== "rejected" && decision !== "pending")
  ) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("project_id, status, applicant_id, dancer_id, recruitment_channel_id")
    .eq("id", application_id)
    .single();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  // pending 으로 되돌리기는 accepted/rejected/declined 에서만 허용.
  const transitionable = new Set(["pending", "accepted", "rejected", "declined"]);
  if (!transitionable.has(app.status)) {
    return {
      ok: false,
      error: "취소·만료된 지원은 상태 변경할 수 없습니다.",
    };
  }
  if (app.status === decision) {
    return { ok: true };
  }

  // 거절 사유(선택) — 거절일 때만 저장, 수락/대기복귀 시 비움.
  const reason = (formData.get("rejection_reason") ?? "").toString().trim() || null;
  // 대기·거절로 되돌리면 확정(confirmed) 상태도 함께 해제 — "확정이면서 거절" 같은 모순 방지.
  const update: {
    status: "accepted" | "rejected" | "pending";
    responded_at: string | null;
    rejection_reason: string | null;
    confirmed_at?: null;
    confirmed_by?: null;
  } =
    decision === "pending"
      ? { status: "pending", responded_at: null, rejection_reason: null, confirmed_at: null, confirmed_by: null }
      : decision === "rejected"
        ? { status: "rejected", responded_at: new Date().toISOString(), rejection_reason: reason, confirmed_at: null, confirmed_by: null }
        : { status: "accepted", responded_at: new Date().toISOString(), rejection_reason: null };

  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", application_id);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 거절 시 댄서에게 거절 안내 메일 발송(사유 있으면 포함). 비치명적 — 실패해도 거절은 유효.
  if (decision === "rejected") {
    try {
      await sendApplicationRejectionEmail({
        applicantId: (app.applicant_id as string | null) ?? null,
        dancerId: (app.dancer_id as string | null) ?? null,
        projectId: (app.project_id as string | null) ?? null,
        reason,
      });
    } catch (e) {
      console.error("[reject-mail] 발송 실패:", e);
    }
  }

  let quotaReached = false;
  const canManageWholeProject = await canManageProject(app.project_id as string);
  if (decision === "accepted" && canManageWholeProject) {
    const [{ data: project }, { count: acceptedNow }] = await Promise.all([
      supabase
        .from("projects")
        .select("recruitment_count, status")
        .eq("id", app.project_id)
        .maybeSingle(),
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("project_id", app.project_id)
        .eq("status", "accepted")
        .is("archived_at", null),
    ]);
    if (
      project &&
      project.status === "open" &&
      (acceptedNow ?? 0) >= (project.recruitment_count ?? 1)
    ) {
      quotaReached = true;
    }
  }

  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  if (app.recruitment_channel_id) {
    const { data: channel } = await supabase
      .from("recruitment_channels")
      .select("project_id")
      .eq("id", app.recruitment_channel_id)
      .maybeSingle();
    if (channel?.project_id && channel.project_id !== app.project_id) {
      revalidatePath(`/projects/${channel.project_id}/applicants`);
      revalidatePath(`/projects/${channel.project_id}`);
    }
  }
  return {
    ok: true,
    data: quotaReached
      ? { quotaReached: true, projectId: app.project_id as string }
      : undefined,
  };
}

// 일괄 처리 (거절 / 대기로 되돌리기). 수락은 정원·알림 로직 때문에 단건만 허용.
// RLS(applications_update = can_manage_project)가 관리 불가 행을 자동 차단한다.
export async function bulkDecideApplicationsAction(
  formData: FormData,
): Promise<ActionResult<{ updated: number }>> {
  await requireUser();
  const decision = formData.get("decision");
  if (decision !== "rejected" && decision !== "pending") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  let ids: unknown;
  try {
    ids = JSON.parse((formData.get("ids") ?? "[]").toString());
  } catch {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const idList = (Array.isArray(ids) ? ids : [])
    .filter((x): x is string => typeof x === "string")
    .slice(0, 200);
  if (idList.length === 0)
    return { ok: false, error: "선택된 지원이 없습니다." };

  const supabase = await createClient();
  const update =
    decision === "pending"
      ? { status: "pending" as const, responded_at: null, confirmed_at: null, confirmed_by: null }
      : {
          status: "rejected" as const,
          responded_at: new Date().toISOString(),
          confirmed_at: null,
          confirmed_by: null,
        };

  const { data, error } = await supabase
    .from("applications")
    .update(update)
    .in("id", idList)
    // 취소·만료된 지원은 건드리지 않는다.
    .in("status", ["pending", "accepted", "rejected", "declined"])
    .select("id, project_id, recruitment_channel_id");
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  const rows = (data ?? []) as {
    id: string;
    project_id: string;
    recruitment_channel_id: string | null;
  }[];
  const projectIds = new Set(rows.map((r) => r.project_id));
  const channelIds = Array.from(
    new Set(
      rows
        .map((r) => r.recruitment_channel_id)
        .filter((id): id is string => !!id),
    ),
  );
  if (channelIds.length > 0) {
    const { data: channels } = await supabase
      .from("recruitment_channels")
      .select("project_id")
      .in("id", channelIds);
    for (const channel of (channels ?? []) as Array<{ project_id: string }>) {
      projectIds.add(channel.project_id);
    }
  }
  for (const pid of projectIds) {
    revalidatePath(`/projects/${pid}/applicants`);
  }
  return { ok: true, data: { updated: rows.length } };
}

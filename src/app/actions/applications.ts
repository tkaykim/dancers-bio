"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanizeDbError } from "@/lib/db-errors";
import { sendApplicationRejectionEmail } from "@/lib/notify/rejection-mail";
import { NEEDS_DANCER_ERROR } from "@/lib/lite-constants";
import { isExpired } from "@/lib/utils/deadline";
import { castingApplicationDetailsSchema } from "@/lib/validation/application-details";
import { getRoundMessage, normalizeRounds } from "@/lib/application-stage";
import { closeGmailPool, isFatalSmtpError } from "@/lib/gmail";
import {
  normalizeNationalityOptions,
  type NationalityOption,
} from "@/lib/nationality";
import type { ActionResult } from "./auth";
import { resolveAvailabilitySelection } from "@/lib/application-availability";
import {
  chooseRecruitmentAttributionSource,
  recruitmentAttributionCookieName,
  recruitmentChannelMatchesProject,
} from "@/lib/recruitment-attribution";

// Lite MVP: 1계정 = 1댄서 가정. team apply / manager-as-actor 분기 모두 제거.
// 항상 본인 own dancer (profile_id = user.id) 중 가장 오래된 1개로 INSERT.
// dancer가 없으면 NEEDS_DANCER sentinel 반환 → 클라이언트에서 onboarding으로 유도.
/** 지원 직후 화면이 바로 쓸 정보. 가이드가 없는 공고면 guideUrl 은 null. */
export type ApplyOutcome = { guideUrl: string | null; accepted: boolean };

export async function applyToProjectAction(
  formData: FormData,
): Promise<ActionResult<ApplyOutcome>> {
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
    .select("owner_id, status, visibility, deleted_at, application_deadline, is_standing_pool, collect_applicant_fee, collect_casting_details, guide_url, auto_accept_on_apply")
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

  const attributionCookieStore = await cookies();
  const storedShareCode = requestedChannelId
    ? null
    : attributionCookieStore.get(recruitmentAttributionCookieName(project_id))
        ?.value;
  const attributionSource = chooseRecruitmentAttributionSource({
    requestedChannelId,
    storedShareCode,
  });

  let recruitment_channel_id: string | null = null;
  if (attributionSource) {
    const admin = createAdminClient();
    let channelQuery = admin
      .from("recruitment_channels")
      .select("id, project_id, legacy_project_id, status");
    channelQuery =
      attributionSource.kind === "id"
        ? channelQuery.eq("id", attributionSource.value)
        : channelQuery.eq("share_code", attributionSource.value);
    const { data: channel, error: channelError } =
      await channelQuery.maybeSingle();
    if (channelError) {
      console.error("[apply] 저장된 모집채널 확인 실패", {
        projectId: project_id,
        code: channelError.code,
      });
      return { ok: false, error: "모집채널 확인에 실패했습니다." };
    }
    const matchesProject = recruitmentChannelMatchesProject(channel, project_id);
    if (attributionSource.kind === "id" && !matchesProject) {
      return { ok: false, error: "유효하지 않은 모집채널입니다." };
    }
    if (matchesProject) recruitment_channel_id = channel?.id as string;
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

  // 지원 화면에 표시된 후보 일정 전체를 서버에서 다시 조회한다.
  // 선택한 일정은 가능, 나머지는 불가로 한 번에 저장해 누락을 만들지 않는다.
  const scheduleAdmin = createAdminClient();
  const { data: availabilityScheduleRows, error: availabilityScheduleError } =
    await scheduleAdmin
      .from("project_schedules")
      .select("id")
      .eq("project_id", project_id)
      .eq("collect_availability", true)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("sort_order");
  if (availabilityScheduleError) {
    return {
      ok: false,
      error: "일정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  const availabilitySelection = resolveAvailabilitySelection(
    (availabilityScheduleRows ?? []).map((row: { id: string }) => row.id),
    formData
      .getAll("availability_schedule_ids")
      .map((value) => value.toString()),
  );
  if (!availabilitySelection.ok) {
    return availabilitySelection;
  }

  // 공개 동의는 지원서 단위로만 기록한다. 국적 목록은 클라이언트 값을 믿지 않고
  // 본인 dancer_private_info에서 다시 읽어, 동의한 당시의 스냅샷으로 저장한다.
  const requestedNationalityConsent =
    formData.get("nationality_disclosure_consent") === "true";
  let nationality_disclosure_consent = false;
  let disclosed_nationalities: NationalityOption[] | null = null;
  if (requestedNationalityConsent) {
    const admin = createAdminClient();
    const { data: privateInfo, error: privateInfoError } = await admin
      .from("dancer_private_info")
      .select("nationalities, nationality_code, nationality")
      .eq("dancer_id", dancerId)
      .maybeSingle();
    if (privateInfoError) {
      return { ok: false, error: "국적 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    const stored = normalizeNationalityOptions(privateInfo?.nationalities);
    const fallbackCode = String(privateInfo?.nationality_code ?? "")
      .trim()
      .toUpperCase();
    const fallbackLabel = String(privateInfo?.nationality ?? "").trim();
    const nationalities =
      stored.length > 0 || !fallbackCode || !fallbackLabel
        ? stored
        : [{ code: fallbackCode, label: fallbackLabel }];
    if (nationalities.length === 0) {
      return { ok: false, error: "프로필에 국적을 먼저 등록해 주세요." };
    }
    nationality_disclosure_consent = true;
    disclosed_nationalities = nationalities;
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

  // 선발 없이 전원 진행하는 공고(챌린지 등)는 지원과 동시에 확정한다.
  // 확정 안내를 기다리는 사이에 이탈이 발생해, 그 대기 자체를 없앤다.
  const autoAccept = project.auto_accept_on_apply === true;

  const { error } = await supabase.from("applications").insert({
    project_id,
    applicant_id: user.id,
    dancer_id: dancerId,
    team_id: null,
    source: "apply" as const,
    status: autoAccept ? ("accepted" as const) : ("pending" as const),
    responded_at: autoAccept ? new Date().toISOString() : null,
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
    nationality_disclosure_consent,
    disclosed_nationalities,
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

  // 프로젝트별 귀속 쿠키는 지원이 실제 저장된 뒤에만 소비한다.
  attributionCookieStore.delete(recruitmentAttributionCookieName(project_id));

  if (availabilitySelection.responses.length > 0) {
    const respondedAt = new Date().toISOString();
    const { error: scheduleResponseError } = await scheduleAdmin
      .from("project_schedule_responses")
      .upsert(
        availabilitySelection.responses.map((response) => ({
          ...response,
          dancer_id: dancerId,
          time_slots: null,
          note: null,
          responded_at: respondedAt,
        })),
        { onConflict: "schedule_id,dancer_id" },
      );
    if (scheduleResponseError) {
      console.error("[apply] 일정 가능여부 저장 실패", {
        projectId: project_id,
        dancerId,
        code: scheduleResponseError.code,
      });
      return {
        ok: false,
        error:
          "지원서는 접수됐지만 일정 응답 저장에 실패했습니다. 운영팀에 문의해 주세요.",
      };
    }
  }

  revalidatePath(`/projects/${project_id}`);
  revalidatePath("/applications");
  // 가이드가 등록된 공고는 지원 직후 화면에서 바로 열어볼 수 있게 링크를 돌려준다.
  return { ok: true, data: { guideUrl: (project.guide_url as string | null) ?? null, accepted: autoAccept } };
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

// 선발 단계 이동 — 운영자 전용. 단계 관련 상태 변경은 전부 이 액션 하나로 모은다.
//
//   round = 0            → 대기로 되돌림
//   0 < round < total    → 중간 단계 합격 (최종 아님, 본인 포기 가능)
//   round = total        → 최종 합격 확정 (confirmed_at 설정, 본인 포기 불가)
//
// 단계 안내 메일은 단계별로 1회만 나간다(project_notification_log 멱등).
export async function setApplicationRoundAction(
  formData: FormData,
): Promise<
  ActionResult<{
    round: number;
    isFinal: boolean;
    projectId?: string;
    quota?: QuotaSignal;
  }>
> {
  const user = await requireUser();
  const application_id = (formData.get("application_id") ?? "").toString();
  const roundRaw = Number((formData.get("round") ?? "").toString());
  if (!application_id || !Number.isInteger(roundRaw) || roundRaw < 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("id, project_id, status, passed_round, confirmed_at, applicant_id, dancer_id")
    .eq("id", application_id)
    .maybeSingle();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  if (!(await canManageProject(app.project_id as string))) {
    return { ok: false, error: "단계를 변경할 권한이 없습니다." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("selection_rounds, round_labels, round_messages")
    .eq("id", app.project_id as string)
    .maybeSingle();
  const total = normalizeRounds(
    (project?.selection_rounds as number | null) ?? null,
  );
  if (roundRaw > total) {
    return { ok: false, error: `이 공고는 ${total}단계까지만 있습니다.` };
  }

  const isFinal = roundRaw === total && roundRaw > 0;
  const now = new Date().toISOString();
  const update =
    roundRaw === 0
      ? {
          status: "pending" as const,
          passed_round: 0,
          responded_at: null,
          rejection_reason: null,
          confirmed_at: null,
          confirmed_by: null,
        }
      : {
          status: "accepted" as const,
          passed_round: roundRaw,
          responded_at: now,
          rejection_reason: null,
          confirmed_at: isFinal ? now : null,
          confirmed_by: isFinal ? user.id : null,
        };

  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", application_id);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 메시지 스레드가 이미 있으면 운영 타임라인으로 남긴다(방 신규 생성은 안 함). 비치명적.
  try {
    const { appendStageSystemMessage } = await import("@/lib/messaging/send");
    await appendStageSystemMessage({
      projectId: app.project_id as string,
      dancerId: (app.dancer_id as string | null) ?? null,
      body:
        roundRaw === 0
          ? "선발 단계가 검토 중으로 변경되었습니다."
          : isFinal
            ? "최종 합격이 확정되었습니다."
            : `${roundRaw}차 합격 처리되었습니다. (최종 확정 아님)`,
    });
  } catch (e) {
    console.error("[messaging] stage log 실패:", e);
  }

  if (roundRaw > 0 && app.applicant_id) {
    try {
      const { sendStageEmail } = await import("@/lib/notify/stage-mail");
      const msg = getRoundMessage(project?.round_messages, roundRaw);
      await sendStageEmail({
        applicantId: app.applicant_id as string,
        dancerId: (app.dancer_id as string | null) ?? null,
        projectId: app.project_id as string,
        round: roundRaw,
        totalRounds: total,
        roundLabels: (project?.round_labels as string[] | null) ?? null,
        bodyOverride: msg.body,
        note: msg.note,
      });
    } catch (e) {
      console.error("[stage-mail] 발송 실패:", e);
    }
  }

  // 모집 정원은 "최종 합격" 기준으로 센다. 중간 단계 합격자는 정원에 포함하지 않는다.
  const quota = isFinal
    ? await readQuota(supabase, app.project_id as string)
    : null;

  revalidatePath(`/projects/${app.project_id as string}/applicants`);
  revalidatePath(`/projects/${app.project_id as string}`);
  revalidatePath("/applications");
  return {
    ok: true,
    data: {
      round: roundRaw,
      isFinal,
      ...(quota ? { quota, projectId: app.project_id as string } : {}),
    },
  };
}

// 아직 결과 안내가 나가지 않은 지원자에게 일괄 발송한다. 합격(단계 안내)과 불합격을 함께 처리한다.
//
// 자동 발송이 아닌 이유
//   - 캐스팅보드 벌크 반영은 상태만 바꾸고 메일을 보내지 않는다.
//   - 일괄 거절(bulkDecideApplicationsAction)도 마찬가지다.
//   벌크에서 자동으로 보내면 승인 없이 수십~수백 통이 나간다.
//   대신 콘솔이 "미발송 N명"을 드러내고, 운영자가 이 액션으로 직접 트리거한다.
//
// 한 번에 BATCH 건만 처리하고 remaining 을 돌려준다.
// 수백 통을 한 요청에서 순차 발송하면 서버리스 실행 시간 제한에 걸린다.
// 클라이언트가 remaining 이 0 이 될 때까지 반복 호출한다.
const NOTICE_BATCH = 20;

export async function sendPendingNoticesAction(
  formData: FormData,
): Promise<ActionResult<{ sent: number; skipped: number; remaining: number }>> {
  await requireUser();
  const projectId = (formData.get("project_id") ?? "").toString();
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "안내를 발송할 권한이 없습니다." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: project }, { data: rows }, { data: logRows }] = await Promise.all([
    supabase
      .from("projects")
      .select("selection_rounds, round_labels, round_messages")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, applicant_id, dancer_id, passed_round, status")
      .eq("project_id", projectId)
      .in("status", ["accepted", "rejected", "declined"])
      .is("archived_at", null)
      .limit(1000),
    admin
      .from("project_notification_log")
      .select("recipient_id, channel")
      .eq("project_id", projectId)
      .or("channel.like.stage_r%,channel.eq.stage_reject"),
  ]);

  const totalRounds = normalizeRounds(
    (project?.selection_rounds as number | null) ?? null,
  );
  const roundLabels = (project?.round_labels as string[] | null) ?? null;
  const sentSet = new Set(
    ((logRows ?? []) as Array<{ recipient_id: string; channel: string }>).map(
      (r) => `${r.recipient_id}|${r.channel}`,
    ),
  );

  type Row = {
    applicant_id: string | null;
    dancer_id: string | null;
    passed_round: number | null;
    status: string;
  };
  // 본인 포기(declined)는 스스로 빠진 것이라 불합격 안내를 보내지 않는다.
  const pendingRows = ((rows ?? []) as Row[]).filter((r) => {
    if (!r.applicant_id) return false;
    if (r.status === "declined") return false;
    const channel =
      r.status === "accepted"
        ? `stage_r${Math.max(Number(r.passed_round ?? 0), 1)}`
        : "stage_reject";
    return !sentSet.has(`${r.applicant_id}|${channel}`);
  });

  const batch = pendingRows.slice(0, NOTICE_BATCH);
  const { sendStageEmail } = await import("@/lib/notify/stage-mail");
  const { sendApplicationRejectionEmail: sendReject } = await import(
    "@/lib/notify/rejection-mail"
  );

  let sent = 0;
  let skipped = 0;
  let fatal: string | null = null;
  for (const row of batch) {
    try {
      let res: { ok: boolean; skipped?: string; error?: string };
      if (row.status === "accepted") {
        const round = Math.max(Number(row.passed_round ?? 0), 1);
        const msg = getRoundMessage(project?.round_messages, round);
        res = await sendStageEmail({
          applicantId: row.applicant_id,
          dancerId: row.dancer_id,
          projectId,
          round,
          totalRounds,
          roundLabels,
          bodyOverride: msg.body,
          note: msg.note,
        });
      } else {
        res = await sendReject({
          applicantId: row.applicant_id,
          dancerId: row.dancer_id,
          projectId,
        });
      }
      if (res.ok && !res.skipped) sent++;
      else skipped++;
      // 인증 잠김·발송 한도는 재시도할수록 악화된다. 즉시 멈춘다.
      if (!res.ok && isFatalSmtpError(res.error)) {
        fatal = res.error ?? "SMTP 오류";
        break;
      }
    } catch (e) {
      console.error("[notice] 일괄 발송 실패:", e);
      skipped++;
    }
  }

  closeGmailPool();
  revalidatePath(`/projects/${projectId}/applicants`);
  if (fatal) {
    return {
      ok: false,
      error: `메일 서버가 발송을 거부했습니다. 남은 발송을 중단합니다 — ${fatal.slice(0, 160)}`,
    };
  }
  return {
    ok: true,
    data: { sent, skipped, remaining: Math.max(pendingRows.length - batch.length, 0) },
  };
}

// 중간 단계 합격(최종 확정 전) 상태에서 본인이 참여를 포기한다.
// 최종 선발(confirmed_at 있음) 이후에는 불가 — 서버·DB 트리거 양쪽에서 막는다.
// 상태는 'declined'(본인 거절)로 두어 운영자 거절('rejected')과 구분한다.
export async function declineAcceptedApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const application_id = formData.get("application_id");
  if (typeof application_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const reason = (formData.get("reason") ?? "").toString().trim().slice(0, 500);

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, status, confirmed_at, project_id, dancer_id, passed_round")
    .eq("id", application_id)
    .maybeSingle();
  if (!app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };
  if (app.applicant_id !== user.id) {
    return { ok: false, error: "본인 지원만 포기할 수 있습니다." };
  }
  if (app.status !== "accepted") {
    return { ok: false, error: "1차 합격 상태에서만 포기할 수 있습니다." };
  }
  if (app.confirmed_at) {
    return {
      ok: false,
      error:
        "최종 합격한 지원은 직접 포기할 수 없습니다. contact@deetz.kr 로 연락해 주세요.",
    };
  }
  // 2차 이상까지 올라온 뒤의 이탈은 후속 충원 판단이 필요하므로 사유를 받는다.
  if (Number(app.passed_round ?? 0) >= 2 && !reason) {
    return {
      ok: false,
      error: "이 단계에서는 포기 사유를 남겨주셔야 합니다.",
    };
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", application_id)
    .eq("status", "accepted")
    .is("confirmed_at", null);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 메시지 스레드가 이미 있으면 운영 타임라인으로 남긴다. 비치명적.
  try {
    const { appendStageSystemMessage } = await import("@/lib/messaging/send");
    await appendStageSystemMessage({
      projectId: (app.project_id as string | null) ?? "",
      dancerId: (app.dancer_id as string | null) ?? null,
      body: "지원자가 참여를 포기했습니다.",
    });
  } catch (e) {
    console.error("[messaging] decline log 실패:", e);
  }

  // 대체 인원을 바로 검토할 수 있도록 운영자에게 알린다. 비치명적.
  try {
    const { sendSelfDeclineNotice } = await import("@/lib/notify/stage-mail");
    await sendSelfDeclineNotice({
      projectId: (app.project_id as string | null) ?? null,
      applicantId: (app.applicant_id as string | null) ?? null,
      dancerId: (app.dancer_id as string | null) ?? null,
      reason: reason || null,
    });
  } catch (e) {
    console.error("[decline-notice] 발송 실패:", e);
  }

  revalidatePath("/applications");
  revalidatePath(`/projects/${app.project_id as string}/applicants`);
  return { ok: true };
}

/**
 * 최종 확정 인원과 모집 정원을 함께 읽어 운영자에게 보여줄 신호를 만든다.
 *
 * 정원 초과를 서버에서 막지 않는 이유
 *   대기·대체 인원을 미리 확정해 두는 건 정상 운영이다. 하드 차단하면 운영자가
 *   정원을 임시로 부풀렸다가 되돌리는 우회를 하게 되고, 그러면 정원 숫자 자체를
 *   믿을 수 없게 된다. 대신 초과했다는 사실을 반드시 눈에 보이게 한다.
 *   (간편 접수 quickApplyAction 은 반대로 하드 차단한다 — 익명 접수는 스스로
 *   accepted 로 들어오므로 상한이 없으면 무제한으로 찬다.)
 *
 * over 는 공고가 이미 마감(status != open)돼 있어도 알린다. 마감 뒤 확정을 더
 * 얹는 경우가 오히려 초과를 눈치채기 어려운 상황이다.
 */
export type QuotaSignal = {
  /** 확정 인원이 정원에 도달했다(마감 제안 대상). 공고가 열려 있을 때만 true. */
  reached: boolean;
  /** 확정 인원이 정원을 넘었다. 마감 여부와 무관하게 알린다. */
  over: boolean;
  confirmed: number;
  capacity: number;
};

async function readQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<QuotaSignal | null> {
  const [{ data: project }, { count }] = await Promise.all([
    supabase
      .from("projects")
      .select("recruitment_count, status")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .not("confirmed_at", "is", null)
      .is("archived_at", null),
  ]);
  if (!project) return null;

  const capacity = project.recruitment_count ?? 1;
  const confirmed = count ?? 0;
  if (confirmed < capacity) return null;

  return {
    reached: project.status === "open",
    over: confirmed > capacity,
    confirmed,
    capacity,
  };
}

// Lite: 최종 확정 인원이 recruitment_count에 도달하면 quota 신호를 반환해
// 클라이언트가 "마감할까요?" 확인 후 closeProjectAction을 직접 호출.
// 자동 마감 트리거는 마이그레이션 20260516_004에서 제거됨.
export async function decideApplicationAction(
  formData: FormData,
): Promise<ActionResult<{ projectId?: string; quota?: QuotaSignal }>> {
  const user = await requireUser();
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

  // 공고의 단계 수를 먼저 읽는다. 1단계 공고에서는 '합격'이 곧 최종 합격이라
  // confirmed_at 까지 같이 찍어야 한다(안 찍으면 "합격인데 최종 확정 대기"로 떠서
  // 지원자가 계속 본인 포기를 할 수 있다).
  const { data: roundProject } = await supabase
    .from("projects")
    .select("selection_rounds, round_labels, round_messages")
    .eq("id", app.project_id as string)
    .maybeSingle();
  const totalRounds = normalizeRounds(
    (roundProject?.selection_rounds as number | null) ?? null,
  );
  const acceptIsFinal = totalRounds === 1;

  // 거절 사유(선택) — 거절일 때만 저장, 수락/대기복귀 시 비움.
  const reason = (formData.get("rejection_reason") ?? "").toString().trim() || null;
  // 대기·거절로 되돌리면 확정·통과단계도 함께 해제 — "최종 합격이면서 거절" 같은 모순 방지.
  // 여기서 '합격'은 첫 단계 통과. 2차 이상은 setApplicationRoundAction 담당.
  const now = new Date().toISOString();
  const update: {
    status: "accepted" | "rejected" | "pending";
    responded_at: string | null;
    rejection_reason: string | null;
    passed_round: number;
    confirmed_at?: string | null;
    confirmed_by?: string | null;
  } =
    decision === "pending"
      ? { status: "pending", responded_at: null, rejection_reason: null, passed_round: 0, confirmed_at: null, confirmed_by: null }
      : decision === "rejected"
        ? { status: "rejected", responded_at: now, rejection_reason: reason, passed_round: 0, confirmed_at: null, confirmed_by: null }
        : {
            status: "accepted",
            responded_at: now,
            rejection_reason: null,
            passed_round: 1,
            confirmed_at: acceptIsFinal ? now : null,
            confirmed_by: acceptIsFinal ? user.id : null,
          };

  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", application_id);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 메시지 스레드가 이미 있으면 운영 타임라인으로 남긴다(방 신규 생성은 안 함). 비치명적.
  if (decision !== "pending") {
    try {
      const { appendStageSystemMessage } = await import("@/lib/messaging/send");
      await appendStageSystemMessage({
        projectId: app.project_id as string,
        dancerId: (app.dancer_id as string | null) ?? null,
        body:
          decision === "accepted"
            ? acceptIsFinal
              ? "최종 합격이 확정되었습니다."
              : "1차 합격 처리되었습니다. (최종 확정 아님)"
            : "선발 결과가 메일로 안내되었습니다.",
      });
    } catch (e) {
      console.error("[messaging] stage log 실패:", e);
    }
  }

  // 거절 시 댄서에게 거절 안내 메일 발송(사유 있으면 포함). 비치명적 — 실패해도 거절은 유효.
  if (decision === "rejected") {
    try {
      await sendApplicationRejectionEmail({
        applicantId: (app.applicant_id as string | null) ?? null,
        dancerId: (app.dancer_id as string | null) ?? null,
        projectId: (app.project_id as string | null) ?? null,
      });
    } catch (e) {
      console.error("[reject-mail] 발송 실패:", e);
    }
  }

  // 단계 통과 안내 자동 발송. 단건 액션이라 폭주하지 않고, 단계별 1회만 나간다.
  if (decision === "accepted" && app.applicant_id && app.project_id) {
    try {
      const { sendStageEmail } = await import("@/lib/notify/stage-mail");
      const msg = getRoundMessage(roundProject?.round_messages, 1);
      await sendStageEmail({
        applicantId: app.applicant_id as string,
        dancerId: (app.dancer_id as string | null) ?? null,
        projectId: app.project_id as string,
        round: 1,
        totalRounds,
        roundLabels: (roundProject?.round_labels as string[] | null) ?? null,
        bodyOverride: msg.body,
        note: msg.note,
      });
    } catch (e) {
      console.error("[stage-mail] 발송 실패:", e);
    }
  }

  // 정원은 "최종 합격(confirmed_at)" 인원으로 센다.
  // 중간 단계 합격자까지 세면 1차 합격만으로 정원이 차버린다.
  const canManageWholeProject = await canManageProject(app.project_id as string);
  const quota =
    decision === "accepted" && acceptIsFinal && canManageWholeProject
      ? await readQuota(supabase, app.project_id as string)
      : null;

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
    data: quota ? { quota, projectId: app.project_id as string } : undefined,
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
  // 대기·거절로 되돌리면 통과 단계도 0으로 초기화한다(단건 처리와 동일).
  const update =
    decision === "pending"
      ? {
          status: "pending" as const,
          responded_at: null,
          passed_round: 0,
          confirmed_at: null,
          confirmed_by: null,
        }
      : {
          status: "rejected" as const,
          responded_at: new Date().toISOString(),
          passed_round: 0,
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

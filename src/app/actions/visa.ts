"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { countryLabel } from "@/lib/data/countries";
import { visaLabel } from "@/lib/data/korea-visas";
import { buildSocialUrl, type SocialPlatform } from "@/lib/utils/social";
import { slugify } from "@/lib/utils/slug";
import { sendVisaApplicationEmail } from "@/lib/notify/visa-application-mail";
import { sendVisaApplicantConfirmationEmail } from "@/lib/notify/visa-applicant-confirmation-mail";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaFollowupTrackingToken,
  VISA_APPLICATION_CONFIRMATION_CAMPAIGN,
} from "@/lib/visa/tracking";
import type { ActionResult } from "./auth";

type AdminClient = ReturnType<typeof createAdminClient>;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

// 메신저 종류 → social_links 플랫폼 매핑 (프로필에 연결되는 것만).
const MESSENGER_TO_SOCIAL: Record<string, SocialPlatform> = {
  instagram: "instagram",
  youtube: "youtube",
  tiktok: "tiktok",
};

const contactSchema = z.object({
  type: z.string().trim().min(1).max(40),
  handle: z.string().trim().min(1).max(200),
});

const submitSchema = z.object({
  lang: z.enum(["en", "ja", "ko"]).default("en"),
  source: z.enum(["visa", "program"]).default("visa"),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(120),
  stageName: z.string().trim().max(120).optional().nullable(),
  nationalityCode: z.string().trim().min(1).max(10),
  email: z.string().trim().email("이메일 형식을 확인해 주세요.").max(200),
  contacts: z.array(contactSchema).max(10).default([]),
  hasVisa: z.boolean(),
  visaType: z.string().trim().max(20).optional().nullable(),
  skillLevel: z.number().int().min(1).max(4),
  koreanLevel: z.enum(["none", "some", "fluent"]).optional().nullable(),
  danceVideoUrl: z.string().trim().max(500).optional().nullable(),
  currentlyInKorea: z.boolean(),
  hasResidenceInKorea: z.boolean(),
  residenceRegion: z.string().trim().max(120).optional().nullable(),
  availableEntryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type VisaSubmitInput = z.input<typeof submitSchema>;

// stage_name 기반 slug 자동 생성(충돌 회피). 비라틴 이름이면 빈 base → null 반환(링크는 /d/{id}로 동작).
async function resolveSlug(admin: AdminClient, stageName: string): Promise<string | null> {
  const base = slugify(stageName);
  if (!base) return null;
  const { data } = await admin.rpc("next_available_slug", {
    base,
    target_table: "dancers",
    exclude_id: null,
  });
  return (data as string | null) ?? null;
}

function socialLinksFromContacts(
  contacts: { type: string; handle: string }[],
): Record<string, string> | null {
  const links: Record<string, string> = {};
  for (const c of contacts) {
    const platform = MESSENGER_TO_SOCIAL[c.type.trim().toLowerCase()];
    if (!platform || links[platform]) continue;
    const url = buildSocialUrl(platform, c.handle);
    if (url) links[platform] = url;
  }
  return Object.keys(links).length > 0 ? links : null;
}

/**
 * 공개(비로그인) 비자 온보딩 제출.
 * service-role로 ① 비공개 dancers row(approval pending → 디렉토리 제외, is_active true → 링크만)
 * ② dancer_private_info(국적/비자/연락처) ③ dancer_visa_applications(신청 본문) 를 적재하고
 * 운영자에게 메일 알림(비치명적)을 보낸다.
 */
export async function submitVisaApplicationAction(
  input: VisaSubmitInput,
): Promise<ActionResult<{ applicationId: string; dancerId: string; profileUrl: string | null; caseUrl: string }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;

  if (d.nationalityCode.toUpperCase() === "KR") {
    const errorByLang = {
      en: "This visa program is only for foreign dancers who need a visa to stay and work in Korea. South Korean citizens do not need to apply.",
      ja: "このビザプログラムは、韓国での滞在・活動にビザが必要な外国人ダンサーのみお申し込みいただけます。韓国籍の方はお申し込み不要です。",
      ko: "이 비자 프로그램은 한국 체류와 활동을 위해 비자 발급이 필요한 외국인 댄서만 신청할 수 있습니다. 대한민국 국적자는 신청할 필요가 없습니다.",
    } satisfies Record<typeof d.lang, string>;
    return { ok: false, error: errorByLang[d.lang] };
  }

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류로 제출에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const nationality = countryLabel(d.nationalityCode, "ko") || d.nationalityCode;
  const stageName = (d.stageName && d.stageName.trim()) || d.name;
  const slug = await resolveSlug(admin, stageName);
  const socialLinks = socialLinksFromContacts(d.contacts);
  const entryDate = d.availableEntryDate ? d.availableEntryDate : null;

  // ① 비공개 dancers row (approval_status=pending, is_active=true 는 컬럼 기본값)
  const { data: dancer, error: dancerErr } = await admin
    .from("dancers")
    .insert({
      profile_id: null,
      stage_name: stageName,
      korean_name: d.name,
      slug,
      ...(socialLinks ? { social_links: socialLinks } : {}),
    })
    .select("id, slug")
    .single();
  if (dancerErr || !dancer) {
    return { ok: false, error: "신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const dancerId = dancer.id as string;
  const finalSlug = (dancer.slug as string | null) ?? slug;

  // ② 민감정보(국적·비자·연락처) → dancer_private_info
  const phoneContact = d.contacts.find((c) => /^[+\d][\d\s-]{6,}$/.test(c.handle));
  await admin.from("dancer_private_info").insert({
    dancer_id: dancerId,
    email: d.email,
    phone: phoneContact?.handle ?? null,
    nationality_code: d.nationalityCode,
    nationality,
    is_korean_national: false,
    has_visa: d.hasVisa,
    visa_type: d.hasVisa ? (d.visaType ?? null) : null,
    source: "visa_onboarding",
  });

  // ③ 신청 본문 → dancer_visa_applications
  const { data: appRow, error: appErr } = await admin
    .from("dancer_visa_applications")
    .insert({
      dancer_id: dancerId,
      skill_level: d.skillLevel,
      korean_level: d.koreanLevel ?? null,
      dance_video_url: d.danceVideoUrl || null,
      currently_in_korea: d.currentlyInKorea,
      has_residence_in_korea: d.hasResidenceInKorea,
      residence_region: d.hasResidenceInKorea ? (d.residenceRegion || null) : null,
      available_entry_date: entryDate,
      email: d.email,
      contacts: d.contacts,
      preferred_lang: d.lang,
      status: "new",
      source: d.source,
    })
    .select("id, created_at")
    .single();
  if (appErr || !appRow) {
    // dancers row 정리 (best-effort) — 신청 본문 없는 고아 프로필 방지
    await admin.from("dancers").delete().eq("id", dancerId);
    return { ok: false, error: "신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const profileUrl = finalSlug
    ? `${SITE_URL}/d/${finalSlug}`
    : `${SITE_URL}/d/${dancerId}`;
  const caseUrl = `${SITE_URL}/visa/case/${makeVisaCaseToken(appRow.id as string)}`;

  // 확인 메일에도 추적을 붙인다. 예전에는 링크가 raw 케이스 URL이라
  // 지원자가 메일을 열었는지·눌렀는지 확인할 방법이 아예 없었다.
  const trackingToken = makeVisaFollowupTrackingToken(
    appRow.id as string,
    VISA_APPLICATION_CONFIRMATION_CAMPAIGN,
  );
  const trackedUrl = `${SITE_URL}/api/track/visa-case/click?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(d.lang)}`;
  const openPixelUrl = `${SITE_URL}/api/track/visa-case/open?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(d.lang)}`;

  // 운영자 메일 (비치명적)
  try {
    await sendVisaApplicationEmail({
      id: appRow.id as string,
      name: d.name,
      stage_name: d.stageName?.trim() || null,
      nationality,
      has_visa: d.hasVisa,
      visa_label: d.hasVisa && d.visaType ? visaLabel(d.visaType) : null,
      skill_level: d.skillLevel,
      korean_level: d.koreanLevel ?? null,
      email: d.email,
      contacts: d.contacts,
      currently_in_korea: d.currentlyInKorea,
      has_residence_in_korea: d.hasResidenceInKorea,
      residence_region: d.residenceRegion || null,
      available_entry_date: entryDate,
      dance_video_url: d.danceVideoUrl || null,
      preferred_lang: d.lang,
      profile_url: profileUrl,
      created_at: (appRow.created_at as string) ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error("[submitVisaApplication] ops mail failed (non-fatal):", e);
  }

  // 신청자 접수 확인 메일 (제출 언어로, 정본 양식). 비치명적.
  // 발송 결과는 실패까지 포함해 visa_outbound_mails 에 남긴다 —
  // 예전에는 조용히 삼켜서 어드민에서 "무엇이 나갔는지" 확인할 방법이 없었다.
  try {
    const confirmation = await sendVisaApplicantConfirmationEmail({
      to: d.email,
      name: stageName,
      lang: d.lang,
      caseUrl,
      trackedUrl,
      openPixelUrl,
    });
    if (!confirmation.ok) {
      console.error("[submitVisaApplication] applicant mail failed (non-fatal):", confirmation.error);
    }
    const { error: confirmationLogError } = await admin.from("visa_outbound_mails").insert({
      application_id: appRow.id as string,
      kind: "application_confirmation",
      campaign: VISA_APPLICATION_CONFIRMATION_CAMPAIGN,
      lang: confirmation.lang,
      subject: confirmation.subject,
      body_text: confirmation.text,
      body_html: confirmation.html,
      status: confirmation.ok ? "sent" : "failed",
      source: "system",
      sent_by_name: "자동 접수 확인",
      message_id: confirmation.messageId ?? null,
      error: confirmation.ok ? null : (confirmation.error ?? "unknown"),
      metadata: { caseUrl },
    });
    if (confirmationLogError) {
      console.error("[submitVisaApplication] applicant mail log failed (non-fatal):", confirmationLogError);
    }
  } catch (e) {
    console.error("[submitVisaApplication] applicant mail/log failed (non-fatal):", e);
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { applicationId: appRow.id as string, dancerId, profileUrl, caseUrl } };
}

// ── 어드민: 신청 상태/메모/담당자 갱신 ──────────────────────────────────────

const VISA_STATUSES = [
  "new",
  "reviewing",
  "education",
  "documents",
  "submitted",
  "approved",
  "on_hold",
  "rejected",
] as const;

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(VISA_STATUSES).optional(),
  memo: z.string().max(4000).optional().nullable(),
  assignToSelf: z.boolean().optional(),
});

export async function updateVisaApplicationAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const { id, status, memo, assignToSelf } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (memo !== undefined) patch.memo = memo;
  if (assignToSelf) patch.assigned_to = admin.id;
  if (Object.keys(patch).length === 0) return { ok: true };

  const client = createAdminClient();
  const { error } = await client.from("dancer_visa_applications").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/visa");
  return { ok: true };
}

// ── 어드민: 오디션 → 조건부 트레이닝 → 월말평가 → 비자 운영 ───────────────

const caseOperationsSchema = z.object({
  id: z.string().uuid(),
  auditionAt: z.string().datetime().nullable(),
  auditionLocation: z.string().trim().max(500).nullable(),
  auditionStatus: z.enum(["not_scheduled", "scheduled", "completed", "cancelled", "no_show"]),
  auditionResult: z.enum(["pending", "pass", "training_required", "no_show"]),
  auditionFeedback: z.string().trim().max(4000).nullable(),
  levelTestVideoUrl: z.string().url().max(1000).nullable(),
  trainingRequired: z.boolean().nullable(),
  trainingPartner: z.string().trim().max(300).nullable(),
  trainingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  trainingEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  trainingStatus: z.enum(["not_required", "planned", "in_progress", "completed", "paused"]),
  monthlyEvaluationAt: z.string().datetime().nullable(),
  monthlyEvaluationResult: z.enum(["pending", "pass", "continue", "hold"]),
  quotedPriceKrw: z.number().int().min(0).max(100_000_000).nullable(),
  quoteNote: z.string().trim().max(2000).nullable(),
  nextAction: z.string().trim().max(1000).nullable(),
});

export type VisaCaseOperationsInput = z.input<typeof caseOperationsSchema>;

export async function updateVisaCaseOperationsAction(
  input: VisaCaseOperationsInput,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = caseOperationsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;
  const patch: Record<string, unknown> = {
    audition_at: d.auditionAt,
    audition_location: d.auditionLocation,
    audition_status: d.auditionStatus,
    audition_result: d.auditionResult,
    audition_feedback: d.auditionFeedback,
    level_test_video_url: d.levelTestVideoUrl,
    training_required: d.trainingRequired,
    training_partner: d.trainingPartner,
    training_start_date: d.trainingStartDate,
    training_end_date: d.trainingEndDate,
    training_status: d.trainingStatus,
    monthly_evaluation_at: d.monthlyEvaluationAt,
    monthly_evaluation_result: d.monthlyEvaluationResult,
    quoted_price_krw: d.quotedPriceKrw,
    quote_note: d.quoteNote,
    next_action: d.nextAction,
  };

  // 결과를 저장하는 순간 운영 단계도 함께 이동시켜 분기 누락을 막는다.
  if (d.monthlyEvaluationResult === "pass") {
    patch.case_stage = "visa_documents";
    patch.status = "documents";
    patch.training_status = "completed";
  } else if (d.monthlyEvaluationResult === "continue") {
    patch.case_stage = "training";
    patch.status = "education";
    patch.training_required = true;
  } else if (d.monthlyEvaluationResult === "hold") {
    patch.case_stage = "on_hold";
    patch.status = "on_hold";
  } else if (d.monthlyEvaluationAt && d.monthlyEvaluationResult === "pending") {
    patch.case_stage = "monthly_evaluation";
    patch.status = "education";
  } else if (d.auditionResult === "pass") {
    patch.case_stage = "visa_documents";
    patch.status = "documents";
    patch.training_required = false;
    patch.training_status = "not_required";
  } else if (d.auditionResult === "training_required") {
    patch.case_stage = "training";
    patch.status = "education";
    patch.training_required = true;
    if (d.trainingStatus === "not_required") patch.training_status = "planned";
  } else if (d.auditionResult === "no_show" || d.auditionStatus === "no_show") {
    patch.case_stage = "on_hold";
    patch.status = "on_hold";
  } else if (d.trainingRequired && ["planned", "in_progress", "completed", "paused"].includes(d.trainingStatus)) {
    patch.case_stage = "training";
    patch.status = d.trainingStatus === "paused" ? "on_hold" : "education";
  } else if (d.auditionStatus === "completed") {
    patch.case_stage = "audition_complete";
    patch.status = "reviewing";
  } else if (d.auditionStatus === "scheduled") {
    patch.case_stage = "audition_scheduled";
    patch.status = "reviewing";
  }

  const client = createAdminClient();
  const { error } = await client.from("dancer_visa_applications").update(patch).eq("id", d.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/visa");
  return { ok: true };
}

// ── 어드민: 신청 삭제 (테스트/비실제 지원자 정리) ──────────────────────────────
//
// 온보딩 제출은 dancers(비공개) + dancer_private_info + dancer_visa_applications
// 세 행을 함께 만든다. 신청을 삭제할 때, 아직 claim 안 된 온보딩 전용 프로필
// (profile_id NULL)이고 다른 신청이 남아있지 않으면 고아 프로필·민감정보도
// 함께 정리한다. 실사용자가 claim 한 프로필(profile_id 존재)은 절대 건드리지 않는다.
// 프로필 정리는 FK 등으로 실패해도 신청 삭제 자체는 성공 처리(best-effort).

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteVisaApplicationAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult<{ purgedProfile: boolean }>> {
  await requireAdmin();
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const { id } = parsed.data;
  const client = createAdminClient();

  // 대상 신청의 dancer_id 확보
  const { data: app, error: loadErr } = await client
    .from("dancer_visa_applications")
    .select("id, dancer_id")
    .eq("id", id)
    .single();
  if (loadErr || !app) return { ok: false, error: "신청을 찾을 수 없습니다." };
  const dancerId = (app.dancer_id as string | null) ?? null;

  // 신청 본문 삭제
  const { error: delErr } = await client.from("dancer_visa_applications").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message };

  // 고아 온보딩 프로필 정리(best-effort)
  let purgedProfile = false;
  if (dancerId) {
    try {
      const { data: dancer } = await client
        .from("dancers")
        .select("id, profile_id")
        .eq("id", dancerId)
        .single();
      const unclaimed = dancer && (dancer.profile_id as string | null) == null;

      // 이 프로필을 참조하는 다른 신청이 남아있는지 확인
      const { count: remaining } = await client
        .from("dancer_visa_applications")
        .select("id", { count: "exact", head: true })
        .eq("dancer_id", dancerId);

      if (unclaimed && (remaining ?? 0) === 0) {
        await client.from("dancer_private_info").delete().eq("dancer_id", dancerId);
        const { error: dancerDelErr } = await client
          .from("dancers")
          .delete()
          .eq("id", dancerId)
          .is("profile_id", null);
        if (!dancerDelErr) purgedProfile = true;
      }
    } catch (e) {
      console.error("[deleteVisaApplication] profile cleanup failed (non-fatal):", e);
    }
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { purgedProfile } };
}

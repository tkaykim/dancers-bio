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
): Promise<ActionResult<{ applicationId: string; dancerId: string; profileUrl: string | null }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류로 제출에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const isKorean = d.nationalityCode.toUpperCase() === "KR";
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
    is_korean_national: isKorean,
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
  try {
    await sendVisaApplicantConfirmationEmail({
      to: d.email,
      name: stageName,
      lang: d.lang,
    });
  } catch (e) {
    console.error("[submitVisaApplication] applicant mail failed (non-fatal):", e);
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { applicationId: appRow.id as string, dancerId, profileUrl } };
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

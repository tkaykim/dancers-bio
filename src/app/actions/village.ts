"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { countryLabel } from "@/lib/data/countries";
import { sendVillageWaitlistEmail } from "@/lib/notify/village-waitlist-mail";
import type { ActionResult } from "./auth";

// deetz Village(디츠 빌리지) 사전 수요조사.
// 오픈 전이라 이 액션은 **절대 결제를 다루지 않는다** — 관심 등록과 미진행 사유만 받는다.

const DECLINE_REASONS = [
  "price",
  "roommate",
  "already_housed",
  "facility",
  "location",
  "timing",
  "other",
] as const;

const submitSchema = z
  .object({
    lang: z.enum(["en", "ja", "ko"]).default("en"),
    interested: z.boolean(),
    name: z.string().trim().max(120).optional().nullable(),
    nationalityCode: z.string().trim().max(10).optional().nullable(),
    contactType: z.string().trim().max(40).optional().nullable(),
    contact: z.string().trim().max(200).optional().nullable(),
    preferredOption: z.enum(["a", "b", "either", "undecided"]).optional().nullable(),
    roomPreference: z.enum(["single", "double", "quad", "six", "any"]).optional().nullable(),
    moveInMonth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, "입주 희망 시기 형식을 확인해 주세요.")
      .optional()
      .nullable()
      .or(z.literal("")),
    message: z.string().trim().max(2000).optional().nullable(),
    declineReasons: z.array(z.enum(DECLINE_REASONS)).max(DECLINE_REASONS.length).default([]),
    declineReasonDetail: z.string().trim().max(2000).optional().nullable(),
  })
  // 대기등록은 연락이 닿아야 의미가 있으므로 이름·국적·연락처를 필수로 본다.
  // 미진행 응답은 익명으로도 받아야 응답률이 떨어지지 않는다.
  .refine(
    (d) =>
      !d.interested ||
      (!!d.name?.trim() && !!d.nationalityCode?.trim() && !!d.contact?.trim()),
    { message: "REQUIRED_FIELDS", path: ["name"] },
  );

export type VillageWaitlistInput = z.input<typeof submitSchema>;

const REQUIRED_MESSAGE: Record<"en" | "ja" | "ko", string> = {
  en: "Please fill in your name, nationality, and contact.",
  ja: "お名前・国籍・連絡先をご入力ください。",
  ko: "이름, 국적, 연락처를 입력해 주세요.",
};

const GENERIC_MESSAGE: Record<"en" | "ja" | "ko", string> = {
  en: "Something went wrong. Please try again.",
  ja: "エラーが発生しました。もう一度お試しください。",
  ko: "오류가 발생했습니다. 다시 시도해 주세요.",
};

/**
 * 공개(비로그인) deetz Village 수요조사 제출.
 * village_waitlist 는 RLS default-deny(service-role 전용)라 admin client로 적재하고,
 * 운영자 메일 알림은 비치명적으로 보낸다(메일 실패로 접수가 날아가면 안 된다).
 */
export async function submitVillageWaitlistAction(
  input: VillageWaitlistInput,
): Promise<ActionResult<{ id: string }>> {
  const lang = (input?.lang === "ja" || input?.lang === "ko" ? input.lang : "en") as "en" | "ja" | "ko";

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    // zod 기본 메시지는 영어라 ja/ko 사용자에게 그대로 나가면 안 된다.
    // 우리가 직접 붙인 REQUIRED_FIELDS 만 필수항목 안내로 바꾸고, 나머지는 언어별 일반 메시지로 통일한다.
    const required = parsed.error.issues.some((i) => i.message === "REQUIRED_FIELDS");
    return { ok: false, error: required ? REQUIRED_MESSAGE[lang] : GENERIC_MESSAGE[lang] };
  }
  const d = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: GENERIC_MESSAGE[lang] };
  }

  const code = d.nationalityCode?.trim().toUpperCase() || null;
  const nationality = code ? countryLabel(code, "ko") || code : null;

  const { data: row, error } = await admin
    .from("village_waitlist")
    .insert({
      interested: d.interested,
      name: d.name?.trim() || null,
      nationality_code: code,
      nationality,
      contact_type: d.contact?.trim() ? d.contactType?.trim() || null : null,
      contact: d.contact?.trim() || null,
      preferred_option: d.interested ? (d.preferredOption ?? null) : null,
      room_preference: d.interested ? (d.roomPreference ?? null) : null,
      move_in_month: d.interested ? d.moveInMonth || null : null,
      message: d.message?.trim() || null,
      decline_reasons: d.interested ? [] : d.declineReasons,
      decline_reason_detail: d.interested ? null : d.declineReasonDetail?.trim() || null,
      lang: d.lang,
      source: "village",
      status: "new",
    })
    .select("id, created_at")
    .single();

  if (error || !row) {
    console.error("[submitVillageWaitlist] insert failed:", error);
    return { ok: false, error: GENERIC_MESSAGE[lang] };
  }

  try {
    await sendVillageWaitlistEmail({
      id: row.id as string,
      interested: d.interested,
      name: d.name?.trim() || null,
      nationality,
      contactType: d.contactType?.trim() || null,
      contact: d.contact?.trim() || null,
      preferredOption: d.preferredOption ?? null,
      roomPreference: d.roomPreference ?? null,
      moveInMonth: d.moveInMonth || null,
      message: d.message?.trim() || null,
      declineReasons: d.interested ? [] : d.declineReasons,
      declineReasonDetail: d.declineReasonDetail?.trim() || null,
      lang: d.lang,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error("[submitVillageWaitlist] ops mail failed (non-fatal):", e);
  }

  revalidatePath("/admin/village");
  return { ok: true, data: { id: row.id as string } };
}

// ── 어드민: 상태/메모 갱신 ─────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "converted", "closed"]).optional(),
  memo: z.string().max(4000).optional().nullable(),
});

export async function updateVillageWaitlistAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const { id, status, memo } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (memo !== undefined) patch.memo = memo;
  if (Object.keys(patch).length === 0) return { ok: true };

  const client = createAdminClient();
  const { error } = await client.from("village_waitlist").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/village");
  return { ok: true };
}

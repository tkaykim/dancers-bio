"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVisaCaseToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

// 지원자가 케이스 포털에서 직접 고르는 오디션 참석 여부.
//
// 현장 참가가 원칙이고, 한국에 없거나 입국이 어려운 경우에만 온라인을 고를 수 있게
// 화면에서 안내한다(서버는 선택 자체를 막지 않는다 — 사정을 우리가 다 알 수 없다).
// 대신 온라인을 고르면 사유를 함께 받아 운영자가 판단할 수 있게 한다.

const RSVP = ["onsite", "online", "unavailable"] as const;

const schema = z.object({
  token: z.string().min(10).max(400),
  rsvp: z.enum(RSVP),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type VisaAuditionRsvpInput = z.input<typeof schema>;

const ERR: Record<"en" | "ja" | "ko", string> = {
  en: "Something went wrong. Please try again.",
  ja: "エラーが発生しました。もう一度お試しください。",
  ko: "오류가 발생했습니다. 다시 시도해 주세요.",
};

export async function submitVisaAuditionRsvpAction(
  input: VisaAuditionRsvpInput,
): Promise<ActionResult<{ rsvp: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.en };

  const applicationId = verifyVisaCaseToken(parsed.data.token);
  if (!applicationId) return { ok: false, error: ERR.en };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: ERR.en };
  }

  const { data: app } = await admin
    .from("dancer_visa_applications")
    .select("id, preferred_lang")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return { ok: false, error: ERR.en };

  const lang = (app.preferred_lang === "ko" || app.preferred_lang === "ja" ? app.preferred_lang : "en") as
    | "en"
    | "ja"
    | "ko";

  const patch: Record<string, unknown> = {
    audition_rsvp: parsed.data.rsvp,
    audition_rsvp_at: new Date().toISOString(),
    audition_rsvp_note: parsed.data.note?.trim() || null,
  };
  // 참석이 어렵다고 하면 오디션 상태도 되돌려 운영자가 다음 회차로 옮기게 한다.
  if (parsed.data.rsvp === "unavailable") {
    patch.next_action = "오디션 참석 어려움 — 다음 회차 안내 필요";
  }

  const { error } = await admin
    .from("dancer_visa_applications")
    .update(patch)
    .eq("id", applicationId);
  if (error) {
    console.error("[visa-audition-rsvp] 저장 실패", error);
    return { ok: false, error: ERR[lang] };
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { rsvp: parsed.data.rsvp } };
}

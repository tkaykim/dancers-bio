"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { renderVisaAuditionConfirmedMail, type StageMailLang } from "@/lib/notify/visa-stage-mails";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaFollowupTrackingToken,
  VISA_AUDITION_CONFIRMED_CAMPAIGN,
} from "@/lib/visa/tracking";
import type { ActionResult } from "./auth";

// 오디션(레벨테스트) 일정 확정 안내 메일.
//
// 미팅 안내(visa-meeting.ts)와 같은 흐름을 따른다 — 초안 미리보기 → 2단계 확인 → 발송.
// 지원자에게 나가는 메일이라 자동 발송하지 않고, 운영자가 본문을 확인한 뒤 보낸다.
//
// ⚠ 미리보기에는 열람 픽셀을 넣지 않는다. 예전에 미리보기가 가짜 열람으로 기록된 사고가 있었다.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

function langOf(value: string | null | undefined): StageMailLang {
  return value === "ko" || value === "ja" ? value : "en";
}

const schema = z.object({
  applicationId: z.string().uuid(),
  lang: z.enum(["ko", "en", "ja"]).optional(),
});

type Loaded = {
  email: string;
  name: string;
  lang: StageMailLang;
  auditionAt: string | null;
  location: string | null;
  caseUrl: string;
};

async function load(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string,
  langOverride?: StageMailLang,
): Promise<Loaded | null> {
  const { data: app } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id, audition_at, audition_location")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app?.email) return null;

  let name = "dancer";
  if (app.dancer_id) {
    const { data: dancer } = await admin
      .from("dancers")
      .select("stage_name, korean_name")
      .eq("id", app.dancer_id)
      .maybeSingle();
    name = (dancer?.stage_name as string | null) || (dancer?.korean_name as string | null) || name;
  }

  return {
    email: app.email as string,
    name,
    lang: langOverride ?? langOf(app.preferred_lang as string | null),
    auditionAt: (app.audition_at as string | null) ?? null,
    location: (app.audition_location as string | null) ?? null,
    caseUrl: `${SITE_URL}/visa/case/${makeVisaCaseToken(applicationId)}`,
  };
}

/** 발송 전 본문 미리보기. 추적 픽셀 없이 렌더한다. */
export async function previewVisaAuditionMailAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ subject: string; html: string; to: string; lang: StageMailLang; hasSchedule: boolean }>> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const admin = createAdminClient();
  const loaded = await load(admin, parsed.data.applicationId, parsed.data.lang);
  if (!loaded) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!loaded.auditionAt && !loaded.location?.trim()) {
    return { ok: false, error: "오디션 일시나 장소를 먼저 입력한 뒤 안내를 보낼 수 있습니다." };
  }

  const mail = renderVisaAuditionConfirmedMail({
    name: loaded.name,
    lang: loaded.lang,
    auditionAtIso: loaded.auditionAt,
    location: loaded.location,
    caseUrl: loaded.caseUrl,
  });

  return {
    ok: true,
    data: {
      subject: mail.subject,
      html: mail.html,
      to: loaded.email,
      lang: loaded.lang,
      hasSchedule: Boolean(loaded.auditionAt),
    },
  };
}

/** 실제 발송. 같은 일정으로 두 번 보내지 않게 DB 유니크 인덱스가 잠근다. */
export async function sendVisaAuditionMailAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ sentTo: string }>> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const admin = createAdminClient();
  const loaded = await load(admin, parsed.data.applicationId, parsed.data.lang);
  if (!loaded) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!loaded.auditionAt && !loaded.location?.trim()) {
    return { ok: false, error: "오디션 일시나 장소를 먼저 입력해 주세요." };
  }

  const applicationId = parsed.data.applicationId;
  const auditionKey = loaded.auditionAt ?? (loaded.location ?? "").trim();

  const { count: already } = await admin
    .from("visa_outbound_mails")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
    .eq("kind", "audition_confirmed")
    .eq("status", "sent")
    .eq("metadata->>auditionAt", auditionKey);
  if ((already ?? 0) > 0) {
    return { ok: false, error: "이 일정으로는 이미 안내를 보냈습니다. 일정을 바꾼 뒤 다시 보낼 수 있습니다." };
  }

  const token = makeVisaFollowupTrackingToken(applicationId, VISA_AUDITION_CONFIRMED_CAMPAIGN);
  const trackedUrl = `${SITE_URL}/api/track/visa-case/click?t=${encodeURIComponent(token)}&lang=${loaded.lang}`;
  const openPixelUrl = `${SITE_URL}/api/track/visa-case/open?t=${encodeURIComponent(token)}&lang=${loaded.lang}`;

  const mail = renderVisaAuditionConfirmedMail({
    name: loaded.name,
    lang: loaded.lang,
    auditionAtIso: loaded.auditionAt,
    location: loaded.location,
    caseUrl: loaded.caseUrl,
    trackedUrl,
    openPixelUrl,
  });

  const sent = await sendGmailEmail({
    to: loaded.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  const admin2 = admin;
  const { error: logError } = await admin2.from("visa_outbound_mails").insert({
    application_id: applicationId,
    kind: "audition_confirmed",
    campaign: VISA_AUDITION_CONFIRMED_CAMPAIGN,
    lang: loaded.lang,
    subject: mail.subject,
    body_text: mail.text,
    body_html: mail.html,
    status: sent.ok ? "sent" : "failed",
    source: "admin",
    sent_by_name: "오디션 확정 안내",
    message_id: sent.messageId ?? null,
    error: sent.ok ? null : (sent.error ?? "unknown"),
    metadata: { auditionAt: auditionKey, location: loaded.location, caseUrl: loaded.caseUrl },
  });
  if (logError && logError.code !== "23505") {
    console.error("[visa-audition] 이력 저장 실패", logError);
  }

  if (!sent.ok) {
    return { ok: false, error: `발송에 실패했습니다: ${sent.error ?? "unknown"}` };
  }

  // 안내를 보냈으면 일정이 확정된 것으로 본다.
  await admin2
    .from("dancer_visa_applications")
    .update({ audition_status: "scheduled" })
    .eq("id", applicationId)
    .eq("audition_status", "not_scheduled");

  revalidatePath("/admin/visa");
  return { ok: true, data: { sentTo: loaded.email } };
}

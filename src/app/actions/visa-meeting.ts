"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  renderVisaMeetingInviteMail,
  type MeetingInviteLang,
} from "@/lib/notify/visa-meeting-invite-mail";
import {
  VISA_MEETING_CAMPAIGN,
  makeVisaFollowupTrackingToken,
  recordVisaCaseTrackingEvent,
} from "@/lib/visa/tracking";
import type { ActionResult } from "./auth";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");

// datetime-local(분 단위) 값을 KST로 해석한다. 운영자는 항상 한국시간으로 입력한다.
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const inviteSchema = z.object({
  applicationId: z.string().uuid(),
  meetingAtLocal: z.string().regex(LOCAL_DATETIME, "미팅 일시를 선택해 주세요."),
  meetingUrl: z
    .string()
    .trim()
    .min(8)
    .max(1000)
    .refine((value) => /^https:\/\//i.test(value), "미팅 링크는 https 주소만 사용할 수 있습니다."),
  lang: z.enum(["ko", "en", "ja"]),
});

export type VisaMeetingInviteInput = z.input<typeof inviteSchema>;

function toKstIso(local: string): string {
  return `${local}:00+09:00`;
}

type CaseRow = {
  id: string;
  email: string;
  preferred_lang: string | null;
  dancer_id: string | null;
};

async function loadCase(applicationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as CaseRow;

  let name = "dancer";
  if (row.dancer_id) {
    const { data: dancer } = await admin
      .from("dancers")
      .select("stage_name, korean_name")
      .eq("id", row.dancer_id)
      .maybeSingle();
    const raw =
      (dancer?.stage_name as string | null) || (dancer?.korean_name as string | null) || name;
    // "Kio | 키오"처럼 구분자가 들어간 활동명은 앞부분만 호칭으로 쓴다.
    name = raw.split("|")[0].replace(/\s*\(.*?\)\s*/g, " ").trim() || "dancer";
  }
  return { row, name };
}

function buildUrls(applicationId: string, lang: string, inviteId?: string) {
  const token = makeVisaFollowupTrackingToken(applicationId, VISA_MEETING_CAMPAIGN);
  const query = `t=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}`;
  return {
    openPixelUrl: `${SITE_URL}/api/track/visa-case/open?${query}`,
    trackedUrl: inviteId
      ? `${SITE_URL}/api/track/visa-meeting/click?${query}&i=${encodeURIComponent(inviteId)}`
      : null,
  };
}

/** 발송 전 메일 초안(제목·본문)을 그대로 만들어 돌려준다. 저장·발송 없음. */
export async function previewVisaMeetingInviteAction(
  input: VisaMeetingInviteInput,
): Promise<ActionResult<{ subject: string; html: string; text: string; to: string; name: string }>> {
  await requireAdmin();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const found = await loadCase(parsed.data.applicationId);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };

  const mail = renderVisaMeetingInviteMail({
    name: found.name,
    lang: parsed.data.lang as MeetingInviteLang,
    meetingAtIso: toKstIso(parsed.data.meetingAtLocal),
    meetingUrl: parsed.data.meetingUrl,
    // 미리보기에서는 추적 링크와 열람 픽셀을 모두 뺀다.
    // 픽셀을 넣으면 관리자가 초안을 열어본 것이 지원자 열람으로 잡힌다.
    trackedUrl: null,
    openPixelUrl: null,
  });

  return {
    ok: true,
    data: { ...mail, to: found.row.email, name: found.name },
  };
}

/** 실제 발송 + 이력 저장 + 추적 이벤트 기록. */
export async function sendVisaMeetingInviteAction(
  input: VisaMeetingInviteInput,
): Promise<ActionResult<{ inviteId: string; to: string }>> {
  const profile = await requireAdmin();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const found = await loadCase(parsed.data.applicationId);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!found.row.email) return { ok: false, error: "지원자 이메일이 없습니다." };

  const admin = createAdminClient();
  const meetingAtIso = toKstIso(parsed.data.meetingAtLocal);

  // 먼저 이력 행을 만들어 id를 확보해야 클릭 추적 링크에 invite id를 넣을 수 있다.
  const { data: created, error: createError } = await admin
    .from("visa_meeting_invites")
    .insert({
      application_id: parsed.data.applicationId,
      meeting_at: meetingAtIso,
      meeting_url: parsed.data.meetingUrl,
      lang: parsed.data.lang,
      subject: "(생성 중)",
      body_text: "",
      body_html: "",
      status: "failed",
      sent_by: profile.id,
      sent_by_name: (profile.display_name as string | null) ?? null,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("[visa-meeting] invite insert failed:", createError);
    return { ok: false, error: "발송 준비에 실패했습니다." };
  }

  const urls = buildUrls(parsed.data.applicationId, parsed.data.lang, created.id as string);
  const mail = renderVisaMeetingInviteMail({
    name: found.name,
    lang: parsed.data.lang as MeetingInviteLang,
    meetingAtIso,
    meetingUrl: parsed.data.meetingUrl,
    trackedUrl: urls.trackedUrl,
    openPixelUrl: urls.openPixelUrl,
  });

  const sent = await sendGmailEmail({
    to: found.row.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    replyTo: "contact@deetz.kr",
  });

  await admin
    .from("visa_meeting_invites")
    .update({
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error ?? "unknown",
    })
    .eq("id", created.id);

  if (!sent.ok) {
    return { ok: false, error: `메일 발송에 실패했습니다. (${sent.error ?? "unknown"})` };
  }

  // 지원자에게 나간 모든 메일의 단일 이력에도 남긴다.
  await admin.from("visa_outbound_mails").insert({
    application_id: parsed.data.applicationId,
    kind: "meeting_invite",
    campaign: VISA_MEETING_CAMPAIGN,
    lang: parsed.data.lang,
    subject: mail.subject,
    body_text: mail.text,
    body_html: mail.html,
    status: "sent",
    source: "admin",
    sent_by_name: (profile.display_name as string | null) ?? null,
    metadata: { inviteId: created.id, meetingAt: meetingAtIso, meetingUrl: parsed.data.meetingUrl },
  });

  await recordVisaCaseTrackingEvent({
    applicationId: parsed.data.applicationId,
    campaign: VISA_MEETING_CAMPAIGN,
    eventType: "email_sent",
    eventKey: "meeting_invite",
    lang: parsed.data.lang,
    metadata: { inviteId: created.id, meetingAt: meetingAtIso },
  });

  await admin
    .from("dancer_visa_applications")
    .update({
      next_action: "온라인 미팅 예정",
      status: "reviewing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.applicationId);

  revalidatePath("/admin/visa");
  return { ok: true, data: { inviteId: created.id as string, to: found.row.email } };
}

const mailBodySchema = z.object({ mailId: z.string().uuid() });

/** 보낸 메일 본문을 필요할 때만 불러온다 (목록에는 본문을 싣지 않는다). */
export async function getVisaOutboundMailBodyAction(
  input: z.input<typeof mailBodySchema>,
): Promise<ActionResult<{ html: string }>> {
  await requireAdmin();
  const parsed = mailBodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("visa_outbound_mails")
    .select("body_html")
    .eq("id", parsed.data.mailId)
    .maybeSingle();

  if (!data) return { ok: false, error: "메일을 찾을 수 없습니다." };
  return { ok: true, data: { html: (data.body_html as string) ?? "" } };
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { renderVisaMeetingReminderMail, type StageMailLang } from "@/lib/notify/visa-stage-mails";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaFollowupTrackingToken,
  VISA_MEETING_REMINDER_CAMPAIGN,
} from "@/lib/visa/tracking";

// 확정된 온라인 미팅 하루 전 자동 리마인드.
//
// Vercel Cron 이 매일 정해진 시각에 호출한다(vercel.json).
// 지원자에게 나가는 유일한 완전 자동 메일이라 범위를 좁게 잡았다 —
// "이미 본인이 시간을 고르고 우리가 확정한 미팅"만 대상이고, 새로운 제안은 하지 않는다.
//
// 중복 방지는 DB 유니크 인덱스로 잠근다:
//   visa_outbound_mails (application_id, kind='meeting_reminder', metadata->>'meetingAt')
// 일정이 바뀌면 meetingAt 이 달라져 새 리마인드가 정상 발송된다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

// 크론은 하루 한 번(KST 10:00) 돈다.
// 그래서 창(window)의 폭이 24시간이어야 모든 미팅이 정확히 한 번씩 잡힌다.
//  · 창이 24h보다 좁으면 두 실행 사이에 낀 미팅이 통째로 빠진다.
//    (예: 18~32h 창이면 다음날 저녁 미팅은 오늘 33h·내일 9h로 양쪽 다 벗어난다)
//  · 창이 24h보다 넓으면 같은 미팅이 두 번 잡힌다(유니크 인덱스가 막지만 무의미한 재시도).
// 14~38h로 두면 실제 발송은 미팅 14~38시간 전 = "하루 전"에 해당한다.
const WINDOW_FROM_HOURS = 14;
const WINDOW_TO_HOURS = 38;

function langOf(value: string | null | undefined): StageMailLang {
  return value === "ko" || value === "ja" ? value : "en";
}

export async function GET(request: NextRequest) {
  // Vercel Cron 은 CRON_SECRET 이 있으면 Authorization 헤더를 붙여 보낸다.
  // 설정돼 있는데 값이 다르면 거부한다(외부에서 임의 호출로 메일을 쏘지 못하게).
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 500 });
  }

  const now = Date.now();
  const from = new Date(now + WINDOW_FROM_HOURS * 3600_000).toISOString();
  const to = new Date(now + WINDOW_TO_HOURS * 3600_000).toISOString();

  const { data: invites, error } = await admin
    .from("visa_meeting_invites")
    .select("id, application_id, meeting_at, meeting_url, lang")
    .eq("status", "sent")
    .gte("meeting_at", from)
    .lte("meeting_at", to)
    .order("meeting_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[cron/visa-meeting-reminders] 조회 실패", error);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }

  const results: { applicationId: string; status: string; detail?: string }[] = [];

  for (const invite of invites ?? []) {
    const applicationId = invite.application_id as string;
    const meetingAt = invite.meeting_at as string;

    // 같은 미팅에 이미 리마인드가 나갔으면 건너뛴다(유니크 인덱스가 최종 방어선이지만
    // 여기서 먼저 걸러야 불필요한 메일 발송 시도를 안 한다).
    const { count: already } = await admin
      .from("visa_outbound_mails")
      .select("id", { count: "exact", head: true })
      .eq("application_id", applicationId)
      .eq("kind", "meeting_reminder")
      .eq("status", "sent")
      .eq("metadata->>meetingAt", meetingAt);
    if ((already ?? 0) > 0) {
      results.push({ applicationId, status: "skipped_already_sent" });
      continue;
    }

    const { data: app } = await admin
      .from("dancer_visa_applications")
      .select("id, email, preferred_lang, dancer_id, status, declined_at")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app?.email) {
      results.push({ applicationId, status: "skipped_no_email" });
      continue;
    }
    // 본인이 진행을 접었거나 운영자가 보류한 건에는 리마인드를 보내지 않는다.
    if (app.declined_at || app.status === "on_hold" || app.status === "rejected") {
      results.push({ applicationId, status: "skipped_declined" });
      continue;
    }

    let name = "dancer";
    if (app.dancer_id) {
      const { data: dancer } = await admin
        .from("dancers")
        .select("stage_name, korean_name")
        .eq("id", app.dancer_id)
        .maybeSingle();
      name = (dancer?.stage_name as string | null) || (dancer?.korean_name as string | null) || name;
    }

    const lang = langOf((invite.lang as string | null) ?? (app.preferred_lang as string | null));
    const token = makeVisaFollowupTrackingToken(applicationId, VISA_MEETING_REMINDER_CAMPAIGN);
    const openPixelUrl = `${SITE_URL}/api/track/visa-case/open?t=${encodeURIComponent(token)}&lang=${lang}`;

    const mail = renderVisaMeetingReminderMail({
      name,
      lang,
      meetingAtIso: meetingAt,
      meetingUrl: (invite.meeting_url as string | null) ?? null,
      openPixelUrl,
    });

    const sent = await sendGmailEmail({
      to: app.email as string,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    const { error: logError } = await admin.from("visa_outbound_mails").insert({
      application_id: applicationId,
      kind: "meeting_reminder",
      campaign: VISA_MEETING_REMINDER_CAMPAIGN,
      lang,
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
      status: sent.ok ? "sent" : "failed",
      source: "system",
      sent_by_name: "미팅 하루 전 자동 리마인드",
      message_id: sent.messageId ?? null,
      error: sent.ok ? null : (sent.error ?? "unknown"),
      metadata: { meetingAt, caseUrl: `${SITE_URL}/visa/case/${makeVisaCaseToken(applicationId)}` },
    });
    // 유니크 인덱스 충돌(23505)은 동시 실행에서 정상 — 메일이 두 번 나가지 않았다는 뜻이다.
    if (logError && logError.code !== "23505") {
      console.error("[cron/visa-meeting-reminders] 이력 저장 실패", applicationId, logError);
    }

    results.push({
      applicationId,
      status: sent.ok ? "sent" : "failed",
      detail: sent.ok ? undefined : sent.error,
    });
  }

  const sentCount = results.filter((r) => r.status === "sent").length;
  console.log(
    `[cron/visa-meeting-reminders] 대상 ${invites?.length ?? 0}건 · 발송 ${sentCount}건`,
    JSON.stringify(results),
  );
  return NextResponse.json({ ok: true, candidates: invites?.length ?? 0, sent: sentCount, results });
}

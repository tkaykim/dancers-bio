"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { renderVisaAuditionInviteMail, type StageMailLang } from "@/lib/notify/visa-stage-mails";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaFollowupTrackingToken,
  VISA_AUDITION_INVITE_CAMPAIGN,
} from "@/lib/visa/tracking";
import type { ActionResult } from "./auth";

// 오디션 회차 일괄 초대.
//
// 한 회차(예: 9/16 16:00~18:00)를 여러 지원자에게 동시에 안내한다.
// 지원자에게 나가는 대량 발송이라 반드시 미리보기 → 명시적 확인 → 발송 순서로만 진행한다.
// 보낸 뒤에는 각자 케이스 포털에서 참석 여부를 고르고 참가비를 결제한다.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";
const AUDITION_FEE_KRW = 100_000;

function langOf(value: string | null | undefined): StageMailLang {
  return value === "ko" || value === "ja" ? value : "en";
}

const eventSchema = z.object({
  /** 오디션 시작 (ISO, 예: 2026-09-16T16:00:00+09:00) */
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().trim().min(1).max(300),
  address: z.string().trim().max(300).nullable().optional(),
  transit: z.string().trim().max(300).nullable().optional(),
  mapUrl: z.string().trim().url().max(600).nullable().optional().or(z.literal("")),
});

export type AuditionInviteCandidate = {
  id: string;
  name: string;
  email: string;
  nationality: string | null;
  lang: StageMailLang;
  currentlyInKorea: boolean | null;
  meetingDone: boolean;
  alreadyInvited: boolean;
};

/** 초대 후보 목록. 누구에게 보낼지는 사람이 고른다 — 여기서는 판단하지 않고 정보만 준다. */
export async function listAuditionInviteCandidatesAction(
  input: z.input<typeof eventSchema>,
): Promise<ActionResult<{ candidates: AuditionInviteCandidate[] }>> {
  await requireAdmin();
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "오디션 일시와 장소를 확인해 주세요." };

  const admin = createAdminClient();
  const { data: apps } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id, status, declined_at, currently_in_korea, memo")
    .not("status", "in", "(rejected)")
    .is("declined_at", null)
    .limit(300);

  const rows = (apps ?? []).filter((a) => a.status !== "on_hold");
  if (rows.length === 0) return { ok: true, data: { candidates: [] } };

  const dancerIds = rows.map((r) => r.dancer_id).filter(Boolean) as string[];
  const appIds = rows.map((r) => r.id as string);

  const [{ data: dancers }, { data: privates }, { data: meetings }, { data: invited }] = await Promise.all([
    admin.from("dancers").select("id, stage_name, korean_name").in("id", dancerIds),
    admin.from("dancer_private_info").select("dancer_id, nationality, is_korean_national").in("dancer_id", dancerIds),
    admin
      .from("visa_meeting_invites")
      .select("application_id, meeting_at")
      .in("application_id", appIds)
      .eq("status", "sent"),
    admin
      .from("visa_outbound_mails")
      .select("application_id, metadata")
      .in("application_id", appIds)
      .eq("kind", "audition_invitation")
      .eq("status", "sent"),
  ]);

  const dancerMap = new Map((dancers ?? []).map((d) => [d.id as string, d]));
  const privMap = new Map((privates ?? []).map((p) => [p.dancer_id as string, p]));
  const now = Date.now();
  const meetingDone = new Set(
    (meetings ?? [])
      .filter((m) => new Date(m.meeting_at as string).getTime() < now)
      .map((m) => m.application_id as string),
  );
  // 같은 회차로 이미 초대한 사람은 표시해 중복 발송을 사람이 알아볼 수 있게 한다.
  const invitedSame = new Set(
    (invited ?? [])
      .filter((m) => (m.metadata as Record<string, unknown> | null)?.startsAt === parsed.data.startsAt)
      .map((m) => m.application_id as string),
  );

  const candidates: AuditionInviteCandidate[] = rows
    .filter((a) => {
      const priv = a.dancer_id ? privMap.get(a.dancer_id as string) : undefined;
      // 한국 국적자는 비자 프로그램 대상이 아니다.
      return !priv?.is_korean_national;
    })
    .map((a) => {
      const d = a.dancer_id ? dancerMap.get(a.dancer_id as string) : undefined;
      const priv = a.dancer_id ? privMap.get(a.dancer_id as string) : undefined;
      return {
        id: a.id as string,
        name:
          (d?.stage_name as string | null) || (d?.korean_name as string | null) || (a.email as string),
        email: a.email as string,
        nationality: (priv?.nationality as string | null) ?? null,
        lang: langOf(a.preferred_lang as string | null),
        currentlyInKorea: (a.currently_in_korea as boolean | null) ?? null,
        meetingDone: meetingDone.has(a.id as string),
        alreadyInvited: invitedSame.has(a.id as string),
      };
    })
    // 내부·테스트 계정은 목록에서 뺀다.
    .filter((c) => !/e2e|astcompany|odh@grigoent/i.test(`${c.name} ${c.email}`));

  candidates.sort((a, b) => Number(b.meetingDone) - Number(a.meetingDone) || a.name.localeCompare(b.name));
  return { ok: true, data: { candidates } };
}

const previewSchema = eventSchema.extend({
  applicationId: z.string().uuid(),
});

export async function previewAuditionInviteAction(
  input: z.input<typeof previewSchema>,
): Promise<ActionResult<{ subject: string; html: string; to: string; lang: StageMailLang }>> {
  await requireAdmin();
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id")
    .eq("id", parsed.data.applicationId)
    .maybeSingle();
  if (!app?.email) return { ok: false, error: "지원자를 찾을 수 없습니다." };

  let name = "dancer";
  if (app.dancer_id) {
    const { data: d } = await admin
      .from("dancers")
      .select("stage_name, korean_name")
      .eq("id", app.dancer_id)
      .maybeSingle();
    name = (d?.stage_name as string | null) || (d?.korean_name as string | null) || name;
  }

  const lang = langOf(app.preferred_lang as string | null);
  const mail = renderVisaAuditionInviteMail({
    name,
    lang,
    auditionAtIso: parsed.data.startsAt,
    auditionEndsAtIso: parsed.data.endsAt ?? null,
    location: parsed.data.location,
    address: parsed.data.address ?? null,
    transit: parsed.data.transit ?? null,
    mapUrl: parsed.data.mapUrl || null,
    feeKrw: AUDITION_FEE_KRW,
    caseUrl: `${SITE_URL}/visa/case/${makeVisaCaseToken(parsed.data.applicationId)}`,
  });

  return { ok: true, data: { subject: mail.subject, html: mail.html, to: app.email as string, lang } };
}

const sendSchema = eventSchema.extend({
  applicationIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function sendAuditionInvitesAction(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult<{ sent: number; failed: number; skipped: number; details: string[] }>> {
  await requireAdmin();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };
  const { startsAt, endsAt, location, address, transit, mapUrl, applicationIds } = parsed.data;

  const admin = createAdminClient();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const applicationId of applicationIds) {
    const { data: app } = await admin
      .from("dancer_visa_applications")
      .select("id, email, preferred_lang, dancer_id, status, declined_at")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app?.email || app.declined_at || app.status === "rejected" || app.status === "on_hold") {
      skipped += 1;
      details.push(`${applicationId}: 대상 아님`);
      continue;
    }

    // 같은 회차 중복 발송 방지.
    const { count: already } = await admin
      .from("visa_outbound_mails")
      .select("id", { count: "exact", head: true })
      .eq("application_id", applicationId)
      .eq("kind", "audition_invitation")
      .eq("status", "sent")
      .eq("metadata->>startsAt", startsAt);
    if ((already ?? 0) > 0) {
      skipped += 1;
      continue;
    }

    let name = "dancer";
    if (app.dancer_id) {
      const { data: d } = await admin
        .from("dancers")
        .select("stage_name, korean_name")
        .eq("id", app.dancer_id)
        .maybeSingle();
      name = (d?.stage_name as string | null) || (d?.korean_name as string | null) || name;
    }

    const lang = langOf(app.preferred_lang as string | null);
    const token = makeVisaFollowupTrackingToken(applicationId, VISA_AUDITION_INVITE_CAMPAIGN);
    const caseUrl = `${SITE_URL}/visa/case/${makeVisaCaseToken(applicationId)}`;
    const trackedUrl = `${SITE_URL}/api/track/visa-case/click?t=${encodeURIComponent(token)}&lang=${lang}`;
    const openPixelUrl = `${SITE_URL}/api/track/visa-case/open?t=${encodeURIComponent(token)}&lang=${lang}`;

    const mail = renderVisaAuditionInviteMail({
      name,
      lang,
      auditionAtIso: startsAt,
      auditionEndsAtIso: endsAt ?? null,
      location,
      address: address ?? null,
      transit: transit ?? null,
      mapUrl: mapUrl || null,
      feeKrw: AUDITION_FEE_KRW,
      caseUrl,
      trackedUrl,
      openPixelUrl,
    });

    const result = await sendGmailEmail({
      to: app.email as string,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    await admin.from("visa_outbound_mails").insert({
      application_id: applicationId,
      kind: "audition_invitation",
      campaign: VISA_AUDITION_INVITE_CAMPAIGN,
      lang,
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
      status: result.ok ? "sent" : "failed",
      source: "admin",
      sent_by_name: "오디션 회차 초대",
      message_id: result.messageId ?? null,
      error: result.ok ? null : (result.error ?? "unknown"),
      metadata: { startsAt, endsAt: endsAt ?? null, location, address: address ?? null, transit: transit ?? null, mapUrl: mapUrl || null, caseUrl },
    });

    if (result.ok) {
      sent += 1;
      // 초대를 보낸 사람에게는 오디션 일정을 케이스에도 반영한다.
      await admin
        .from("dancer_visa_applications")
        .update({
          audition_at: startsAt,
          audition_ends_at: endsAt ?? null,
          audition_location: [location, address?.trim()].filter(Boolean).join(" · "),
          audition_status: "scheduled",
          next_action: "오디션 참석 여부 회신 대기",
        })
        .eq("id", applicationId);
    } else {
      failed += 1;
      details.push(`${app.email}: ${result.error ?? "발송 실패"}`);
    }
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { sent, failed, skipped, details } };
}

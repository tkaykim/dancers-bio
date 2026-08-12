"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import {
  createOrGetVisaMeetingCalendarEvent,
  listVisaMeetingCalendarSchedule,
  type VisaMeetingCalendarSchedule,
} from "@/lib/google-calendar/visa-meeting";
import { sendGmailEmail } from "@/lib/gmail";
import {
  renderVisaMeetingInviteMail,
  type MeetingInviteLang,
} from "@/lib/notify/visa-meeting-invite-mail";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consultationCandidatesFromAnswers,
  normalizeConsultationSlot,
} from "@/lib/visa/consultation-slots";
import {
  VISA_MEETING_CAMPAIGN,
  makeVisaFollowupTrackingToken,
  recordVisaCaseTrackingEvent,
} from "@/lib/visa/tracking";
import type { ActionResult } from "./auth";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const meetingSchema = z
  .object({
    applicationId: z.string().uuid(),
    meetingAtLocal: z
      .string()
      .regex(LOCAL_DATETIME, "미팅 일시를 선택해 주세요.")
      .refine(
        (value) => normalizeConsultationSlot(value) === value,
        "유효한 미팅 일시를 선택해 주세요.",
      ),
    durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    lang: z.enum(["ko", "en", "ja"]),
    candidateSlotLocal: z.string().max(40).optional(),
    candidateTimezone: z.string().trim().max(100).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.candidateSlotLocal) !== Boolean(value.candidateTimezone)) {
      context.addIssue({
        code: "custom",
        message: "지원자 후보시간 정보를 다시 선택해 주세요.",
      });
    }
  });

const sendSchema = meetingSchema.and(z.object({ requestId: z.string().uuid() }));
const retrySchema = z.object({ inviteId: z.string().uuid() });

export type VisaMeetingPreviewInput = z.input<typeof meetingSchema>;
export type VisaMeetingInviteInput = z.input<typeof sendSchema>;

function toKstIso(local: string): string {
  return `${local}:00+09:00`;
}

function meetingIsFuture(local: string): boolean {
  return new Date(toKstIso(local)).getTime() > Date.now();
}

type CaseRow = {
  id: string;
  email: string;
  preferred_lang: string | null;
  dancer_id: string | null;
  follow_up_answers: Record<string, unknown> | null;
};

type InviteRow = {
  id: string;
  application_id: string;
  request_id: string | null;
  meeting_at: string;
  meeting_url: string;
  duration_minutes: number;
  source_slot_local: string | null;
  source_timezone: string | null;
  lang: MeetingInviteLang;
  status: string;
  calendar_status: string;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_event_url: string | null;
};

type AdminProfile = { id: string; display_name: string | null };

async function loadCase(applicationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id, follow_up_answers")
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
      (dancer?.stage_name as string | null) ||
      (dancer?.korean_name as string | null) ||
      name;
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

function selectedCandidateIsValid(
  row: CaseRow,
  input: VisaMeetingPreviewInput,
): boolean {
  if (!input.candidateSlotLocal && !input.candidateTimezone) return true;
  return consultationCandidatesFromAnswers(row.follow_up_answers ?? {}).some(
    (candidate) =>
      candidate.sourceLocal === input.candidateSlotLocal &&
      candidate.timezone === input.candidateTimezone &&
      candidate.kstLocal === input.meetingAtLocal,
  );
}

async function ensureCalendarEvent(
  invite: InviteRow,
  found: NonNullable<Awaited<ReturnType<typeof loadCase>>>,
) {
  if (
    invite.calendar_status === "created" &&
    invite.google_event_id &&
    invite.meeting_url
  ) {
    return invite;
  }

  if (!invite.request_id) throw new Error("이 발송 건에는 Calendar 요청 ID가 없습니다.");
  const eventId = invite.request_id.replace(/-/g, "");
  const event = await createOrGetVisaMeetingCalendarEvent({
    eventId,
    applicationId: invite.application_id,
    inviteId: invite.id,
    applicantEmail: found.row.email,
    applicantName: found.name,
    meetingAtIso: invite.meeting_at,
    durationMinutes: invite.duration_minutes,
  });

  const admin = createAdminClient();
  const calendarStatus = event.meetUrl ? "created" : "pending";
  const { error } = await admin
    .from("visa_meeting_invites")
    .update({
      google_calendar_id: event.calendarId,
      google_event_id: event.eventId || eventId,
      google_event_url: event.eventUrl,
      meeting_url: event.meetUrl ?? "",
      calendar_status: calendarStatus,
      calendar_error: null,
      calendar_created_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (error) throw new Error("Calendar 생성 결과 저장에 실패했습니다.");
  if (!event.meetUrl) {
    throw new Error("Google Meet 링크를 생성 중입니다. 잠시 후 재시도해 주세요.");
  }

  return {
    ...invite,
    google_calendar_id: event.calendarId,
    google_event_id: event.eventId || eventId,
    google_event_url: event.eventUrl,
    meeting_url: event.meetUrl,
    calendar_status: "created",
  };
}

async function sendConfirmationMail(
  invite: InviteRow,
  found: NonNullable<Awaited<ReturnType<typeof loadCase>>>,
  profile: AdminProfile,
): Promise<ActionResult<{ inviteId: string; to: string; meetingUrl: string }>> {
  const admin = createAdminClient();
  const urls = buildUrls(invite.application_id, invite.lang, invite.id);
  const mail = renderVisaMeetingInviteMail({
    name: found.name,
    lang: invite.lang,
    meetingAtIso: invite.meeting_at,
    meetingUrl: invite.meeting_url,
    trackedUrl: urls.trackedUrl,
    openPixelUrl: urls.openPixelUrl,
  });

  await admin
    .from("visa_meeting_invites")
    .update({
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
      sent_by: profile.id,
      sent_by_name: profile.display_name,
      error: null,
    })
    .eq("id", invite.id);

  const sent = await sendGmailEmail({
    to: found.row.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    replyTo: "contact@deetz.kr",
    messageId: `<visa-meeting-${invite.id}@deetz.kr>`,
  });

  const sentAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("visa_meeting_invites")
    .update({
      status: sent.ok ? "sent" : "failed",
      message_id: sent.messageId ?? null,
      error: sent.ok ? null : sent.error ?? "unknown",
      mail_sent_at: sent.ok ? sentAt : null,
    })
    .eq("id", invite.id);

  if (!sent.ok) {
    return { ok: false, error: `Calendar와 Meet는 생성됐지만 확정 메일 발송에 실패했습니다. (${sent.error ?? "unknown"})` };
  }
  if (updateError) {
    return { ok: false, error: "확정 메일은 발송됐지만 발송 이력 저장에 실패했습니다." };
  }

  await admin.from("visa_outbound_mails").insert({
    application_id: invite.application_id,
    kind: "meeting_invite",
    campaign: VISA_MEETING_CAMPAIGN,
    lang: invite.lang,
    subject: mail.subject,
    body_text: mail.text,
    body_html: mail.html,
    status: "sent",
    source: "admin",
    sent_by_name: profile.display_name,
    metadata: {
      inviteId: invite.id,
      meetingAt: invite.meeting_at,
      meetingUrl: invite.meeting_url,
      durationMinutes: invite.duration_minutes,
      googleCalendarId: invite.google_calendar_id,
      googleEventId: invite.google_event_id,
      googleEventUrl: invite.google_event_url,
    },
  });

  await recordVisaCaseTrackingEvent({
    applicationId: invite.application_id,
    campaign: VISA_MEETING_CAMPAIGN,
    eventType: "email_sent",
    eventKey: "meeting_invite",
    lang: invite.lang,
    metadata: {
      inviteId: invite.id,
      meetingAt: invite.meeting_at,
      googleEventId: invite.google_event_id,
    },
  });

  await admin
    .from("dancer_visa_applications")
    .update({
      next_action: "온라인 미팅 예정",
      status: "reviewing",
      updated_at: sentAt,
    })
    .eq("id", invite.application_id);

  revalidatePath("/admin/visa");
  return {
    ok: true,
    data: { inviteId: invite.id, to: found.row.email, meetingUrl: invite.meeting_url },
  };
}

/** Builds the branded mail preview without creating a Calendar event or Meet room. */
export async function previewVisaMeetingInviteAction(
  input: VisaMeetingPreviewInput,
): Promise<ActionResult<{ subject: string; html: string; text: string; to: string; name: string }>> {
  await requireAdmin();
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  if (!meetingIsFuture(parsed.data.meetingAtLocal)) {
    return { ok: false, error: "현재보다 이후의 미팅 일시를 선택해 주세요." };
  }

  const found = await loadCase(parsed.data.applicationId);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!selectedCandidateIsValid(found.row, parsed.data)) {
    return { ok: false, error: "지원자가 제출한 후보시간과 일치하지 않습니다." };
  }

  const mail = renderVisaMeetingInviteMail({
    name: found.name,
    lang: parsed.data.lang,
    meetingAtIso: toKstIso(parsed.data.meetingAtLocal),
    meetingUrl: null,
    trackedUrl: null,
    openPixelUrl: null,
  });
  return { ok: true, data: { ...mail, to: found.row.email, name: found.name } };
}

/** Reads the selected KST day's deetz Calendar and marks any overlapping events. */
export async function checkVisaMeetingCalendarAvailabilityAction(
  input: VisaMeetingPreviewInput,
): Promise<ActionResult<VisaMeetingCalendarSchedule>> {
  await requireAdmin();
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  if (!meetingIsFuture(parsed.data.meetingAtLocal)) {
    return { ok: false, error: "현재보다 이후의 미팅 일시를 선택해 주세요." };
  }

  const found = await loadCase(parsed.data.applicationId);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!selectedCandidateIsValid(found.row, parsed.data)) {
    return { ok: false, error: "지원자가 제출한 후보시간과 일치하지 않습니다." };
  }

  try {
    const schedule = await listVisaMeetingCalendarSchedule({
      meetingAtIso: toKstIso(parsed.data.meetingAtLocal),
      durationMinutes: parsed.data.durationMinutes,
    });
    return { ok: true, data: schedule };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[visa-meeting] calendar availability failed:", message);
    return { ok: false, error: "deetz Calendar 일정을 불러오지 못했습니다." };
  }
}

/** Creates one idempotent Calendar/Meet event, then sends the branded confirmation mail. */
export async function sendVisaMeetingInviteAction(
  input: VisaMeetingInviteInput,
): Promise<ActionResult<{ inviteId: string; to: string; meetingUrl: string }>> {
  const rawProfile = await requireAdmin();
  const profile = rawProfile as AdminProfile;
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  if (!meetingIsFuture(parsed.data.meetingAtLocal)) {
    return { ok: false, error: "현재보다 이후의 미팅 일시를 선택해 주세요." };
  }

  const found = await loadCase(parsed.data.applicationId);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (!found.row.email) return { ok: false, error: "지원자 이메일이 없습니다." };
  if (!selectedCandidateIsValid(found.row, parsed.data)) {
    return { ok: false, error: "지원자가 제출한 후보시간과 일치하지 않습니다." };
  }

  const admin = createAdminClient();
  const meetingAtIso = toKstIso(parsed.data.meetingAtLocal);
  const { data: existing } = await admin
    .from("visa_meeting_invites")
    .select("id, application_id, request_id, meeting_at, meeting_url, duration_minutes, source_slot_local, source_timezone, lang, status, calendar_status, google_calendar_id, google_event_id, google_event_url")
    .eq("request_id", parsed.data.requestId)
    .maybeSingle();

  let invite = existing as InviteRow | null;
  if (invite) {
    const sameRequest =
      invite.application_id === parsed.data.applicationId &&
      new Date(invite.meeting_at).getTime() === new Date(meetingAtIso).getTime() &&
      invite.duration_minutes === parsed.data.durationMinutes &&
      invite.lang === parsed.data.lang;
    if (!sameRequest) return { ok: false, error: "중복 요청 ID의 일정 정보가 다릅니다. 화면을 새로고침해 주세요." };
    if (invite.status === "sent" && invite.meeting_url) {
      return {
        ok: true,
        data: { inviteId: invite.id, to: found.row.email, meetingUrl: invite.meeting_url },
      };
    }
  } else {
    try {
      const schedule = await listVisaMeetingCalendarSchedule({
        meetingAtIso,
        durationMinutes: parsed.data.durationMinutes,
      });
      if (schedule.conflictCount > 0) {
        return { ok: false, error: "확정 직전 Calendar에 겹치는 일정이 확인됐습니다. 다른 시간을 선택해 주세요." };
      }
    } catch (error) {
      console.error("[visa-meeting] final calendar availability failed:", error);
      return { ok: false, error: "Calendar 최종 확인에 실패해 확정을 중단했습니다." };
    }

    const { data: created, error } = await admin
      .from("visa_meeting_invites")
      .insert({
        application_id: parsed.data.applicationId,
        request_id: parsed.data.requestId,
        meeting_at: meetingAtIso,
        meeting_url: "",
        duration_minutes: parsed.data.durationMinutes,
        source_slot_local: parsed.data.candidateSlotLocal ?? null,
        source_timezone: parsed.data.candidateTimezone ?? null,
        lang: parsed.data.lang,
        subject: "(Calendar 생성 중)",
        body_text: "",
        body_html: "",
        status: "failed",
        calendar_status: "pending",
        sent_by: profile.id,
        sent_by_name: profile.display_name,
      })
      .select("id, application_id, request_id, meeting_at, meeting_url, duration_minutes, source_slot_local, source_timezone, lang, status, calendar_status, google_calendar_id, google_event_id, google_event_url")
      .single();
    if (error || !created) {
      console.error("[visa-meeting] invite insert failed:", error);
      return { ok: false, error: "Calendar 생성 준비에 실패했습니다." };
    }
    invite = created as InviteRow;
  }

  try {
    invite = await ensureCalendarEvent(invite, found);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from("visa_meeting_invites")
      .update({
        calendar_status: message.includes("생성 중") ? "pending" : "failed",
        calendar_error: message.slice(0, 500),
        error: message.slice(0, 500),
      })
      .eq("id", invite.id);
    revalidatePath("/admin/visa");
    return { ok: false, error: message };
  }

  return sendConfirmationMail(invite, found, profile);
}

/** Retries only the unfinished part, reusing the same Calendar event and Meet link. */
export async function retryVisaMeetingInviteAction(
  input: z.input<typeof retrySchema>,
): Promise<ActionResult<{ inviteId: string; to: string; meetingUrl: string }>> {
  const rawProfile = await requireAdmin();
  const profile = rawProfile as AdminProfile;
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 재시도 요청입니다." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("visa_meeting_invites")
    .select("id, application_id, request_id, meeting_at, meeting_url, duration_minutes, source_slot_local, source_timezone, lang, status, calendar_status, google_calendar_id, google_event_id, google_event_url")
    .eq("id", parsed.data.inviteId)
    .maybeSingle();
  if (!data) return { ok: false, error: "미팅 확정 이력을 찾을 수 없습니다." };
  let invite = data as InviteRow;
  const found = await loadCase(invite.application_id);
  if (!found) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (invite.status === "sent") {
    return { ok: true, data: { inviteId: invite.id, to: found.row.email, meetingUrl: invite.meeting_url } };
  }

  try {
    invite = await ensureCalendarEvent(invite, found);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from("visa_meeting_invites")
      .update({
        calendar_status: message.includes("생성 중") ? "pending" : "failed",
        calendar_error: message.slice(0, 500),
        error: message.slice(0, 500),
      })
      .eq("id", invite.id);
    revalidatePath("/admin/visa");
    return { ok: false, error: message };
  }
  return sendConfirmationMail(invite, found, profile);
}

const mailBodySchema = z.object({ mailId: z.string().uuid() });

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

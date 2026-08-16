import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const VISA_FOLLOWUP_CAMPAIGN = "visa_case_followup_20260723";
// 어드민에서 발송하는 온라인 미팅 안내 메일 전용 캠페인.
export const VISA_MEETING_CAMPAIGN = "visa_meeting_invite";
// 신청 즉시 자동 발송되는 접수 확인 메일 전용 캠페인.
export const VISA_APPLICATION_CONFIRMATION_CAMPAIGN = "visa_application_confirmation";

/** 미팅 하루 전 자동 리마인드(크론). */
export const VISA_MEETING_REMINDER_CAMPAIGN = "visa_meeting_reminder";

/** 오디션(레벨테스트) 일정 확정 안내. */
export const VISA_AUDITION_CONFIRMED_CAMPAIGN = "visa_audition_confirmed";

/** 오디션 초대 — 참석 여부 회신과 참가비 결제를 함께 요청한다. */
export const VISA_AUDITION_INVITE_CAMPAIGN = "visa_audition_invite";

type TrackingPayload = {
  applicationId: string;
  campaign: string;
};

type TrackingEventInput = TrackingPayload & {
  eventType: string;
  eventKey?: string | null;
  lang?: string | null;
  step?: number | null;
  scrollDepth?: number | null;
  pagePath?: string | null;
  metadata?: Record<string, unknown>;
  request?: NextRequest;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return key;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function makeVisaFollowupTrackingToken(
  applicationId: string,
  campaign = VISA_FOLLOWUP_CAMPAIGN,
): string {
  const payload = `vf:${applicationId}:${campaign}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, serviceKey())}`;
}

export function verifyVisaFollowupTrackingToken(token: string | null): TrackingPayload | null {
  try {
    if (!token) return null;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const sig = token.slice(dot + 1);
    const expected = sign(payload, key);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parts = payload.split(":");
    if (parts[0] !== "vf" || !UUID_RE.test(parts[1] ?? "") || !parts[2]) return null;
    return { applicationId: parts[1], campaign: parts.slice(2).join(":") };
  } catch {
    return null;
  }
}

function requestMeta(request?: NextRequest) {
  if (!request) return { userAgent: null, referer: null, ip: null };
  return {
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
  };
}

export async function recordVisaCaseTrackingEvent(input: TrackingEventInput) {
  const { userAgent, referer, ip } = requestMeta(input.request);
  const eventKey = input.eventKey ?? null;
  try {
    const admin = createAdminClient();
    await admin.from("visa_case_tracking_events").insert({
      application_id: input.applicationId,
      campaign: input.campaign,
      event_type: input.eventType,
      event_key: eventKey,
      lang: input.lang ?? null,
      step: input.step ?? null,
      scroll_depth: input.scrollDepth ?? null,
      page_path: input.pagePath ?? null,
      user_agent: userAgent,
      ip,
      referer,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[visa-case-tracking] insert failed", {
      eventType: input.eventType,
      applicationId: input.applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

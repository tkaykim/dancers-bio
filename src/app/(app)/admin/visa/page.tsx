import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { visaLabel } from "@/lib/data/korea-visas";
import { VisaAdminList, type VisaAdminRow } from "@/components/admin/VisaAdminList";
import { VisaAuditionInvitePanel } from "@/components/admin/VisaAuditionInvitePanel";
import type { MeetingInvite, MeetingTracking } from "@/components/admin/VisaMeetingInvitePanel";
import type { OutboundMail } from "@/components/admin/VisaOutboundMailsPanel";
import { VISA_MEETING_CAMPAIGN } from "@/lib/visa/tracking";
import { makeVisaCaseToken } from "@/lib/quick-token";
import { compareVisaCaseDerived, deriveVisaCaseState } from "@/lib/visa/case-state";

export const metadata = { title: "비자 신청 관리 | deetz admin" };

type AppRow = {
  id: string;
  created_at: string;
  status: string;
  memo: string | null;
  skill_level: number | null;
  korean_level: string | null;
  dance_video_url: string | null;
  currently_in_korea: boolean | null;
  has_residence_in_korea: boolean | null;
  residence_region: string | null;
  available_entry_date: string | null;
  email: string;
  contacts: { type: string; handle: string }[] | null;
  preferred_lang: string | null;
  source: string | null;
  dancer_id: string | null;
  case_stage?: string | null;
  audition_at?: string | null;
  audition_location?: string | null;
  audition_status?: string | null;
  audition_result?: string | null;
  audition_feedback?: string | null;
  level_test_video_url?: string | null;
  training_required?: boolean | null;
  training_partner?: string | null;
  training_start_date?: string | null;
  training_end_date?: string | null;
  training_status?: string | null;
  monthly_evaluation_at?: string | null;
  monthly_evaluation_result?: string | null;
  base_price_krw?: number | null;
  quoted_price_krw?: number | null;
  quote_note?: string | null;
  follow_up_answers?: Record<string, unknown> | null;
  follow_up_submitted_at?: string | null;
  project_opportunity_opt_in?: boolean | null;
  next_action?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  decline_reason_detail?: string | null;
  payment_status?: string | null;
  payment_link_sent_at?: string | null;
  payment_order_no?: string | null;
  payment_provider?: string | null;
  payment_amount_krw?: number | null;
  paid_at?: string | null;
  payment_refunded_at?: string | null;
};

type TrackingEventRow = {
  application_id: string;
  created_at: string;
  event_type: string;
  event_key: string | null;
  campaign: string | null;
  lang: string | null;
  step: number | null;
  scroll_depth: number | null;
};

// 미팅 안내 메일 캠페인만 따로 집계한다 (발송 → 열람 → 링크 클릭).
function summarizeMeeting(events: TrackingEventRow[]): MeetingTracking {
  const of = (type: string) => events.filter((event) => event.event_type === type);
  const firstOf = (type: string) => [...of(type)].reverse()[0] ?? null;
  return {
    sentCount: of("email_sent").length,
    openedAt: firstOf("email_open")?.created_at ?? null,
    openCount: of("email_open").length,
    clickedAt: firstOf("cta_click")?.created_at ?? null,
    clickCount: of("cta_click").length,
    lastEventAt: events[0]?.created_at ?? null,
  };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

function summarizeTracking(events: TrackingEventRow[]): VisaAdminRow["tracking"] {
  const latest = events[0] ?? null;
  const firstOf = (type: string) => [...events].reverse().find((event) => event.event_type === type);
  const countOf = (type: string) => events.filter((event) => event.event_type === type).length;
  return {
    eventCount: events.length,
    sentAt: firstOf("email_sent")?.created_at ?? null,
    openedAt: firstOf("email_open")?.created_at ?? null,
    clickedAt: firstOf("cta_click")?.created_at ?? null,
    visitedAt: firstOf("case_visit")?.created_at ?? null,
    submittedAt: firstOf("follow_up_submit_success")?.created_at ?? null,
    lastEventAt: latest?.created_at ?? null,
    lastEventType: latest?.event_type ?? null,
    maxStep: Math.max(0, ...events.map((event) => event.step ?? 0)),
    maxScrollDepth: Math.max(0, ...events.map((event) => event.scroll_depth ?? 0)),
    openCount: countOf("email_open"),
    clickCount: countOf("cta_click"),
    visitCount: countOf("case_visit"),
  };
}

export default async function AdminVisaPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  // 비자 신청은 RLS default deny — service-role로만 조회 가능.
  const admin = createAdminClient();
  const { data: appsRaw } = await admin
    .from("dancer_visa_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const apps = (appsRaw ?? []) as unknown as AppRow[];
  const dancerIds = Array.from(new Set(apps.map((a) => a.dancer_id).filter(Boolean))) as string[];
  const appIds = apps.map((a) => a.id);

  const dancerMap = new Map<string, { stage_name: string | null; korean_name: string | null; slug: string | null }>();
  const privMap = new Map<
    string,
    {
      nationality: string | null;
      has_visa: boolean | null;
      visa_type: string | null;
      is_korean_national: boolean | null;
    }
  >();
  const trackingMap = new Map<string, ReturnType<typeof summarizeTracking>>();
  const meetingTrackingMap = new Map<string, MeetingTracking>();
  const invitesMap = new Map<string, MeetingInvite[]>();
  const outboundMap = new Map<string, OutboundMail[]>();
  // 오디션 확정 안내 최근 발송 (신청건당 1건) — 패널의 중복 발송 방지 표시용
  const auditionMailMap = new Map<string, { sentAt: string; key: string | null }>();

  if (dancerIds.length > 0) {
    const [{ data: dancers }, { data: privs }] = await Promise.all([
      admin.from("dancers").select("id, stage_name, korean_name, slug").in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select("dancer_id, nationality, has_visa, visa_type, nationality_code, is_korean_national")
        .in("dancer_id", dancerIds),
    ]);
    for (const d of (dancers ?? []) as unknown as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
      slug: string | null;
    }>) {
      dancerMap.set(d.id, { stage_name: d.stage_name, korean_name: d.korean_name, slug: d.slug });
    }
    for (const p of (privs ?? []) as unknown as Array<{
      dancer_id: string;
      nationality: string | null;
      has_visa: boolean | null;
      visa_type: string | null;
      nationality_code: string | null;
      is_korean_national: boolean | null;
    }>) {
      privMap.set(p.dancer_id, {
        nationality: p.nationality,
        has_visa: p.has_visa,
        visa_type: p.visa_type,
        // 한국 국적은 표시 문자열이 아니라 구조화 신호로 판정한다 (/visa/apply 차단 조건과 동일).
        is_korean_national:
          p.is_korean_national ?? (p.nationality_code ? p.nationality_code.toUpperCase() === "KR" : null),
      });
    }
  }

  if (appIds.length > 0) {
    const { data: trackingEvents } = await admin
      .from("visa_case_tracking_events")
      .select("application_id, created_at, event_type, event_key, campaign, lang, step, scroll_depth")
      .in("application_id", appIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    const grouped = new Map<string, TrackingEventRow[]>();
    for (const event of (trackingEvents ?? []) as unknown as TrackingEventRow[]) {
      grouped.set(event.application_id, [...(grouped.get(event.application_id) ?? []), event]);
    }
    for (const [applicationId, events] of grouped.entries()) {
      trackingMap.set(applicationId, summarizeTracking(events));
      const meetingEvents = events.filter((event) => event.campaign === VISA_MEETING_CAMPAIGN);
      if (meetingEvents.length > 0) meetingTrackingMap.set(applicationId, summarizeMeeting(meetingEvents));
    }

    const { data: inviteRows } = await admin
      .from("visa_meeting_invites")
      .select("id, application_id, request_id, meeting_at, meeting_url, duration_minutes, source_slot_local, source_timezone, lang, subject, body_html, status, error, calendar_status, calendar_error, google_event_url, sent_by_name, created_at, mail_sent_at")
      .in("application_id", appIds)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const invite of (inviteRows ?? []) as unknown as Array<MeetingInvite & { application_id: string }>) {
      const { application_id: applicationId, ...rest } = invite;
      invitesMap.set(applicationId, [...(invitesMap.get(applicationId) ?? []), rest]);
    }

    // 본문은 목록에 싣지 않는다 (열어볼 때만 서버 액션으로 가져온다).
    const { data: mailRows } = await admin
      .from("visa_outbound_mails")
      .select("id, application_id, kind, lang, subject, status, source, sent_by_name, sent_at, metadata")
      .in("application_id", appIds)
      .order("sent_at", { ascending: false })
      .limit(1000);
    for (const mail of (mailRows ?? []) as unknown as Array<
      OutboundMail & { application_id: string; metadata?: Record<string, unknown> | null }
    >) {
      const { application_id: applicationId, metadata, ...rest } = mail;
      outboundMap.set(applicationId, [...(outboundMap.get(applicationId) ?? []), rest]);
      // 오디션 확정 안내는 "같은 일정으로 이미 보냈는지"를 패널에서 보여줘야 한다.
      if (rest.kind === "audition_confirmed" && rest.status === "sent" && !auditionMailMap.has(applicationId)) {
        auditionMailMap.set(applicationId, {
          sentAt: rest.sent_at,
          key: (metadata?.auditionAt as string | null) ?? null,
        });
      }
    }
  }

  const baseRows: Omit<VisaAdminRow, "derived">[] = apps.map((a) => {
    const d = a.dancer_id ? dancerMap.get(a.dancer_id) : undefined;
    const p = a.dancer_id ? privMap.get(a.dancer_id) : undefined;
    return {
      id: a.id,
      created_at: a.created_at,
      status: a.status,
      memo: a.memo,
      skill_level: a.skill_level,
      korean_level: a.korean_level,
      dance_video_url: a.dance_video_url,
      currently_in_korea: a.currently_in_korea,
      has_residence_in_korea: a.has_residence_in_korea,
      residence_region: a.residence_region,
      available_entry_date: a.available_entry_date,
      email: a.email,
      contacts: Array.isArray(a.contacts) ? a.contacts : [],
      preferred_lang: a.preferred_lang,
      source: a.source,
      dancer_id: a.dancer_id,
      stage_name: d?.stage_name ?? null,
      korean_name: d?.korean_name ?? null,
      slug: d?.slug ?? null,
      nationality: p?.nationality ?? null,
      is_korean_national: p?.is_korean_national ?? null,
      has_visa: p?.has_visa ?? null,
      visa_label: p?.visa_type ? visaLabel(p.visa_type) : null,
      case_url: `${SITE_URL}/visa/case/${makeVisaCaseToken(a.id)}`,
      case_stage: a.case_stage ?? "application_received",
      audition_at: a.audition_at ?? null,
      audition_location: a.audition_location ?? null,
      audition_status: a.audition_status ?? "not_scheduled",
      audition_result: a.audition_result ?? "pending",
      audition_feedback: a.audition_feedback ?? null,
      level_test_video_url: a.level_test_video_url ?? null,
      training_required: a.training_required ?? null,
      training_partner: a.training_partner ?? null,
      training_start_date: a.training_start_date ?? null,
      training_end_date: a.training_end_date ?? null,
      training_status: a.training_status ?? "not_required",
      monthly_evaluation_at: a.monthly_evaluation_at ?? null,
      monthly_evaluation_result: a.monthly_evaluation_result ?? "pending",
      base_price_krw: a.base_price_krw ?? 4_000_000,
      quoted_price_krw: a.quoted_price_krw ?? null,
      quote_note: a.quote_note ?? null,
      follow_up_answers: a.follow_up_answers ?? {},
      follow_up_submitted_at: a.follow_up_submitted_at ?? null,
      project_opportunity_opt_in: a.project_opportunity_opt_in ?? null,
      next_action: a.next_action ?? null,
      declined_at: a.declined_at ?? null,
      decline_reason: a.decline_reason ?? null,
      decline_reason_detail: a.decline_reason_detail ?? null,
      payment_status: a.payment_status ?? "unpaid",
      payment_link_sent_at: a.payment_link_sent_at ?? null,
      payment_order_no: a.payment_order_no ?? null,
      payment_provider: a.payment_provider ?? null,
      payment_amount_krw: a.payment_amount_krw ?? null,
      paid_at: a.paid_at ?? null,
      payment_refunded_at: a.payment_refunded_at ?? null,
      tracking: trackingMap.get(a.id) ?? null,
      meeting_tracking: meetingTrackingMap.get(a.id) ?? null,
      meeting_invites: invitesMap.get(a.id) ?? [],
      outbound_mails: outboundMap.get(a.id) ?? [],
      audition_mail_sent_at: auditionMailMap.get(a.id)?.sentAt ?? null,
      audition_mail_key: auditionMailMap.get(a.id)?.key ?? null,
    };
  });

  // 파생 상태·정렬은 서버에서 고정 시각으로 계산한다 (클라이언트 Date.now()는 hydration이 흔들린다).
  const nowIso = new Date().toISOString();
  const rows: VisaAdminRow[] = baseRows
    .map((row) => ({ ...row, derived: deriveVisaCaseState(row, nowIso) }))
    .sort((a, b) => compareVisaCaseDerived(a.derived, b.derived));

  const actionCount = rows.filter((r) => r.derived.sortBucket === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 관리자 · 비자</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">E-6-1 비자 신청</h1>
        <p className="text-sm text-ink-2">
          /visa 온보딩으로 들어온 해외 댄서 신청. 총 {rows.length}건
          {actionCount > 0 ? ` · 지금 처리할 것 ${actionCount}건` : ""}.
        </p>
      </header>

      <VisaAuditionInvitePanel />

      <VisaAdminList rows={rows} />
    </div>
  );
}

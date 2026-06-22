import "server-only";

// deetz 댄서 알림톡 이벤트 발송 (서버 전용).
// 전부 best-effort: 내부에서 try/catch 하여 호출 액션의 본 흐름을 절대 막지 않는다.
// env(SOLAPI_*, 템플릿ID) 미설정 시 graceful no-op → 카카오 심사 승인 전까지 안전.
// 멱등: alimtalk_log claim-first (이벤트,댄서,참조) 1회.

import { createAdminClient } from "@/lib/supabase/admin";
import { alimtalkConfigured, normalizePhone, sendAlimtalk } from "./solapi";

type Admin = ReturnType<typeof createAdminClient>;

type EventType =
  | "dancer_approved"
  | "profile_incomplete"
  | "casting_proposal"
  | "schedule_request";

function templateIdFor(event: EventType): string | undefined {
  switch (event) {
    case "dancer_approved":
      return process.env.SOLAPI_TPL_DANCER_APPROVED;
    case "profile_incomplete":
      return process.env.SOLAPI_TPL_PROFILE_INCOMPLETE;
    case "casting_proposal":
      return process.env.SOLAPI_TPL_CASTING_PROPOSAL;
    case "schedule_request":
      return process.env.SOLAPI_TPL_SCHEDULE;
  }
}

type Contact = { name: string; phone: string | null; slug: string };

/** 댄서의 발송용 이름·휴대폰·슬러그. 휴대폰 = dancer_private_info.phone → (claim 시) profiles.phone. */
async function getDancerContact(
  admin: Admin,
  dancerId: string,
): Promise<Contact | null> {
  const { data: d } = await admin
    .from("dancers")
    .select("id, stage_name, slug, profile_id")
    .eq("id", dancerId)
    .maybeSingle();
  if (!d) return null;

  let phone: string | null = null;
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select("phone")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  phone = normalizePhone((pi?.phone as string | null) ?? null);
  if (!phone && d.profile_id) {
    const { data: p } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", d.profile_id as string)
      .maybeSingle();
    phone = normalizePhone((p?.phone as string | null) ?? null);
  }

  return {
    name: (d.stage_name as string) || "댄서",
    phone,
    slug: (d.slug as string) || (d.id as string),
  };
}

/** claim-first 멱등 발송. 이미 보낸 (이벤트,댄서,참조)면 조용히 중단. */
async function claimAndSend(
  admin: Admin,
  opts: {
    event: EventType;
    dancerId: string;
    refId: string | null;
    phone: string;
    variables: Record<string, string | number | null | undefined>;
  },
): Promise<void> {
  const templateId = templateIdFor(opts.event);
  if (!templateId) return; // 템플릿 미승인/미설정 = no-op

  const { data: claimed, error: claimErr } = await admin
    .from("alimtalk_log")
    .insert({
      event_type: opts.event,
      dancer_id: opts.dancerId,
      ref_id: opts.refId,
      phone: opts.phone,
      template_id: templateId,
      status: "claimed",
    })
    .select("id")
    .maybeSingle();
  if (claimErr || !claimed) return; // 유니크 충돌(이미 발송) 또는 에러 → 중단

  const res = await sendAlimtalk({
    to: opts.phone,
    templateId,
    variables: opts.variables,
  });

  await admin
    .from("alimtalk_log")
    .update({
      status: res.ok ? "sent" : res.skipped ? "skipped" : "failed",
      message_id: res.messageId ?? null,
      error: res.error ?? null,
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    .eq("id", claimed.id as string);
}

/** ① 프로필 승인 — 승인 시 1회. 인스타에 dancers.bio 링크 유도. */
export async function sendDancerApprovalAlimtalk(dancerId: string): Promise<void> {
  try {
    if (!alimtalkConfigured()) return;
    const admin = createAdminClient();
    const c = await getDancerContact(admin, dancerId);
    if (!c?.phone) return;
    await claimAndSend(admin, {
      event: "dancer_approved",
      dancerId,
      refId: null,
      phone: c.phone,
      variables: { 이름: c.name, 슬러그: c.slug },
    });
  } catch {
    /* 알림톡 실패는 무시 */
  }
}

/** ② 프로필 보완 독려 — 부실 프로필 댄서에게(배치/관리자 호출). */
export async function sendProfileIncompleteAlimtalk(dancerId: string): Promise<void> {
  try {
    if (!alimtalkConfigured()) return;
    const admin = createAdminClient();
    const c = await getDancerContact(admin, dancerId);
    if (!c?.phone) return;
    await claimAndSend(admin, {
      event: "profile_incomplete",
      dancerId,
      refId: null,
      phone: c.phone,
      variables: { 이름: c.name },
    });
  } catch {
    /* 무시 */
  }
}

/** ③ 캐스팅 제안 도착 — 매니저 1:1 제안 시. */
export async function sendCastingProposalAlimtalk(args: {
  dancerId: string;
  applicationId: string;
  projectTitle: string;
}): Promise<void> {
  try {
    if (!alimtalkConfigured()) return;
    const admin = createAdminClient();
    const c = await getDancerContact(admin, args.dancerId);
    if (!c?.phone) return;
    await claimAndSend(admin, {
      event: "casting_proposal",
      dancerId: args.dancerId,
      refId: args.applicationId,
      phone: c.phone,
      variables: { 이름: c.name, 프로젝트명: args.projectTitle },
    });
  } catch {
    /* 무시 */
  }
}

/** ④ 일정 확인 요청 — 일정설문 발송 시(이메일과 나란히). token = /s/<token> 개인 매직링크. */
export async function sendScheduleRequestAlimtalk(args: {
  dancerId: string;
  projectId: string;
  projectTitle: string;
  token: string;
}): Promise<void> {
  try {
    if (!alimtalkConfigured()) return;
    const admin = createAdminClient();
    const c = await getDancerContact(admin, args.dancerId);
    if (!c?.phone) return;
    await claimAndSend(admin, {
      event: "schedule_request",
      dancerId: args.dancerId,
      refId: args.projectId,
      phone: c.phone,
      variables: {
        이름: c.name,
        프로젝트명: args.projectTitle,
        토큰: args.token,
      },
    });
  } catch {
    /* 무시 */
  }
}

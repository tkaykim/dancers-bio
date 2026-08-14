import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { getOrCreatePrefs } from "./notification-preferences";

/**
 * 프로필 승인 완료 안내 메일.
 *
 * 설계 근거는 docs/APPROVAL_ONBOARDING_PLAN.md §4.
 *  - 알림톡에는 "SNS에 링크 걸어두세요" 를 넣을 수 없다(카카오 검수 광고성 반려 이력).
 *    그래서 그 내용은 이 메일이 담당한다 — 이 메일이 안내의 본체다.
 *  - 대표 링크는 dancers.bio/<slug> 하나로 민다. deetz.kr/d/<slug> 는 보조.
 *  - 멱등: career_reminder_log(dancer_id, stage) UNIQUE 재사용. stage='approval_welcome'.
 *    (이 테이블은 이름만 career 일 뿐 dancer 아웃리치 로그 구조 그대로다.)
 *  - ⚠️ 대량발송 HTML 에 Supabase Storage 이미지를 넣지 않는다.
 *    2026-08-06 cached egress quota 초과로 메일 이미지가 통째 깨진 이력이 있다(INTEGRATIONS.md).
 *    로고는 Vercel 정적자산(www.deetz.kr/brand/...)만 쓰고 SNS 는 텍스트 링크로 둔다.
 */

const SITE = "https://www.deetz.kr";
const VANITY = "https://dancers.bio";
const STAGE = "approval_welcome";

export type WelcomeMailOutcome =
  | { ok: true; email: string }
  | { ok: false; skipped: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type DancerRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_id: string | null;
  approval_status: string;
};

type LoadContextResult =
  | { error: string }
  | { dancer: DancerRow; email: string; igVerified: boolean };

/** 승인 안내 메일에 담을 컨텍스트. slug 가 없으면 보낼 수 없다(링크가 uuid 로 나감). */
async function loadContext(dancerId: string): Promise<LoadContextResult> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("dancers")
    .select("id, stage_name, korean_name, slug, profile_id, approval_status")
    .eq("id", dancerId)
    .maybeSingle();
  if (!d) return { error: "dancer_not_found" as const };

  const dancer = d as DancerRow;
  if (dancer.approval_status !== "approved") return { error: "not_approved" as const };
  if (!dancer.slug) return { error: "no_slug" as const };
  if (!dancer.profile_id) return { error: "no_account" as const };

  // 수신 주소: 가입 계정 이메일 우선, 없으면 비공개 정보의 이메일.
  let email: string | null = null;
  const { data: u } = await admin.auth.admin.getUserById(dancer.profile_id);
  if (u?.user?.email) email = u.user.email;
  if (!email) {
    const { data: priv } = await admin
      .from("dancer_private_info")
      .select("email")
      .eq("dancer_id", dancer.id)
      .maybeSingle();
    if (priv?.email) email = priv.email as string;
  }
  if (!email) return { error: "no_email" as const };

  // 인스타 본인인증 여부 — 미완료면 메일에 인증 안내 블록을 붙인다.
  const { data: prof } = await admin
    .from("profiles")
    .select("instagram_verified_at, can_create_project")
    .eq("id", dancer.profile_id)
    .maybeSingle();

  return {
    dancer,
    email,
    igVerified: Boolean(prof?.instagram_verified_at),
  };
}

function buildText(name: string, slug: string, igVerified: boolean): string {
  return [
    `안녕하세요 ${name}님,`,
    ``,
    `deetz 프로필이 승인되었습니다.`,
    ``,
    `[승인되면 이렇게 달라집니다]`,
    `deetz 댄서 목록과 검색에 노출됩니다.`,
    `구글 등 검색엔진에 프로필이 등록됩니다.`,
    `조건에 맞는 새 공고가 올라오면 알림을 받습니다.`,
    `캐스팅 담당자의 추천 후보에 포함됩니다.`,
    `캐스팅 제안을 직접 받을 수 있습니다.`,
    ``,
    `[내 프로필 링크]`,
    `${VANITY}/${slug}`,
    ``,
    `이 주소를 인스타그램 프로필에 걸어두시면 좋습니다.`,
    `프로필 편집 화면의 웹사이트 칸에 위 주소를 붙여넣으시면 됩니다.`,
    `경력과 영상, 연락 경로가 한 페이지에 정리되어 전달됩니다.`,
    ``,
    `내 프로필 관리: ${SITE}/me/portfolio`,
    ``,
    `감사합니다.`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");
}

function buildHtml(
  name: string,
  slug: string,
  igVerified: boolean,
  unsubscribeUrl: string | null,
): string {
  const safeName = escapeHtml(name);
  const link = `${VANITY}/${escapeHtml(slug)}`;

  const benefits = [
    "deetz 댄서 목록과 검색에 노출됩니다",
    "구글 등 검색엔진에 프로필이 등록됩니다",
    "조건에 맞는 새 공고가 올라오면 알림을 받습니다",
    "캐스팅 담당자의 추천 후보에 포함됩니다",
    "캐스팅 제안을 직접 받을 수 있습니다",
  ]
    .map(
      (t) =>
        `<tr><td style="padding:5px 0;font-size:14px;line-height:1.6;color:#33363b;">· ${t}</td></tr>`,
    )
    .join("");

  // 인스타 본인인증 안내는 메일에 넣지 않는다.
  // 인증의 실제 효익이 "공고 직접 등록" 하나인데 그 기능이 아직 미출시라,
  // 안내하면 없는 기능을 약속하게 된다. (2026-08-14 대표 지시)
  const verifyBlock = "";

  const unsubRow = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">수신거부</a>`
    : "";

  return `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="${SITE}/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>

<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">프로필 승인 완료</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${safeName}님, 프로필이 승인되었습니다.</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">이제 deetz에서 프로필이 공개되고, 캐스팅 제안을 받으실 수 있습니다.</p></td></tr>

<tr><td style="padding:18px 32px 6px;">
  <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:6px;">승인되면 이렇게 달라집니다</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>${benefits}</tbody></table></td></tr>

<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:18px;">
    <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:8px;">내 프로필 링크</div>
    <div style="font-size:17px;font-weight:700;color:#111111;word-break:break-all;line-height:1.5;">${link}</div>
    <div style="font-size:13px;line-height:1.8;color:#44474d;margin-top:12px;">
      이 주소를 <strong>인스타그램 프로필</strong>에 걸어두시면 좋습니다.<br>
      프로필 편집 → 웹사이트 칸에 붙여넣기만 하시면 됩니다.<br>
      경력과 영상, 연락 경로가 한 페이지에 정리되어 전달됩니다.
    </div>
  </div></td></tr>

<tr><td style="padding:16px 32px 6px;">
  <a href="${link}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">내 프로필 보기 →</a></td></tr>
${verifyBlock}
<tr><td style="padding:14px 32px 26px;">
  <a href="${SITE}/me/portfolio" style="display:block;border:1px solid #d4d4d8;color:#111111;text-decoration:none;text-align:center;font-size:14px;font-weight:700;padding:13px 0;border-radius:12px;">프로필 관리하기</a></td></tr>

<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="${SITE}/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 12px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp;
    <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a> &nbsp;·&nbsp;
    <a href="https://www.instagram.com/deetz.kr/" style="color:#44474d;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
    <a href="https://www.youtube.com/@deetzmagazine" style="color:#44474d;text-decoration:none;">YouTube</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 등록하신 주소로 발송되었습니다.${unsubRow}</div></td></tr>
</table></td></tr></table></body></html>`;
}

export type PreparedMail = {
  email: string;
  subject: string;
  text: string;
  html: string;
  slug: string;
  profileId: string | null;
};

/**
 * 발송 없이 수신자·제목·본문만 만든다.
 *
 * 대량 발송 스크립트가 이걸 쓰고 **자기 pool 연결로** 보낸다.
 * 앱 기본 transporter 는 pool 이 아니라, 수백 통을 돌리면 메일마다 SMTP 로그인이 열려
 * Gmail `454-4.7.0 Too many login attempts` 에 걸린다(2026-08-05 실제 발생).
 */
export async function prepareApprovalWelcomeMail(
  dancerId: string,
  opts: { retro?: boolean } = {},
): Promise<{ ok: true; mail: PreparedMail } | { ok: false; skipped: string }> {
  const admin = createAdminClient();

  const { data: already } = await admin
    .from("career_reminder_log")
    .select("id, status")
    .eq("dancer_id", dancerId)
    .eq("stage", STAGE)
    .maybeSingle();
  if (already?.status === "sent") return { ok: false, skipped: "already_sent" };

  const ctx = await loadContext(dancerId);
  if ("error" in ctx) return { ok: false, skipped: ctx.error };
  const { dancer, email, igVerified } = ctx;

  let unsubscribeUrl: string | null = null;
  if (dancer.profile_id) {
    try {
      const prefs = await getOrCreatePrefs(dancer.profile_id);
      if (prefs.email_unsubscribed_all) return { ok: false, skipped: "unsubscribed" };
      unsubscribeUrl = `${SITE}/unsubscribe/${prefs.unsubscribe_token}`;
    } catch {
      return { ok: false, skipped: "prefs_unavailable" };
    }
  }

  const name = dancer.korean_name?.trim() || dancer.stage_name;
  const slug = dancer.slug as string;
  return {
    ok: true,
    mail: {
      email,
      subject: opts.retro
        ? "[deetz] 내 프로필 링크 안내"
        : "[deetz] 프로필이 승인되었습니다",
      text: buildText(name, slug, igVerified),
      html: buildHtml(name, slug, igVerified, unsubscribeUrl),
      slug,
      profileId: dancer.profile_id,
    },
  };
}

/** 발송 결과를 멱등 로그에 남긴다. 성공 행만 다음 회차 재발송을 막는다. */
export async function logApprovalWelcomeMail(params: {
  dancerId: string;
  profileId: string | null;
  email: string;
  subject: string;
  slug: string;
  ok: boolean;
  error?: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("career_reminder_log").upsert(
    {
      dancer_id: params.dancerId,
      profile_id: params.profileId,
      stage: STAGE,
      email: params.email,
      subject: params.subject,
      status: params.ok ? "sent" : "failed",
      detail: params.ok
        ? { slug: params.slug }
        : { slug: params.slug, error: params.error ?? "unknown" },
      sent_at: new Date().toISOString(),
    },
    { onConflict: "dancer_id,stage" },
  );
}

/**
 * 승인 안내 메일 1건 발송 (앱 내 단건 경로). 이미 보냈으면 조용히 skip 한다.
 * 수백 건 배치에는 쓰지 말 것 — 위 prepare + 스크립트의 pool 연결을 쓴다.
 *
 * @param opts.dryRun true 면 실제 발송 없이 대상·본문만 계산한다.
 */
export async function sendApprovalWelcomeMail(
  dancerId: string,
  opts: { dryRun?: boolean; retro?: boolean } = {},
): Promise<WelcomeMailOutcome> {
  const admin = createAdminClient();

  // ① 멱등 — 이미 "성공적으로" 보낸 대상만 건너뛴다.
  //    실패 행까지 차단하면 한도 초과·일시 오류로 실패한 대상이 영영 재발송되지 않는다.
  const { data: already } = await admin
    .from("career_reminder_log")
    .select("id, status")
    .eq("dancer_id", dancerId)
    .eq("stage", STAGE)
    .maybeSingle();
  if (already?.status === "sent") return { ok: false, skipped: "already_sent" };

  const ctx = await loadContext(dancerId);
  if ("error" in ctx) return { ok: false, skipped: ctx.error };
  const { dancer, email, igVerified } = ctx;

  // ② 수신거부 존중.
  let unsubscribeUrl: string | null = null;
  if (dancer.profile_id) {
    try {
      const prefs = await getOrCreatePrefs(dancer.profile_id);
      if (prefs.email_unsubscribed_all) return { ok: false, skipped: "unsubscribed" };
      unsubscribeUrl = `${SITE}/unsubscribe/${prefs.unsubscribe_token}`;
    } catch {
      // 설정 조회 실패로 발송을 막지는 않되, 수신거부 링크 없이 보내지 않는다.
      return { ok: false, skipped: "prefs_unavailable" };
    }
  }

  const name = dancer.korean_name?.trim() || dancer.stage_name;
  const slug = dancer.slug as string;
  const subject = opts.retro
    ? "[deetz] 내 프로필 링크 안내"
    : "[deetz] 프로필이 승인되었습니다";

  if (opts.dryRun) return { ok: true, email };

  const res = await sendGmailEmail({
    to: email,
    subject,
    text: buildText(name, slug, igVerified),
    html: buildHtml(name, slug, igVerified, unsubscribeUrl),
  });

  // ③ 성공·실패 모두 로그. (dancer_id, stage) UNIQUE 라서 재시도는 upsert 로 덮어쓴다.
  //    성공(status='sent') 행만 다음 회차에서 재발송을 막는다.
  await admin.from("career_reminder_log").upsert(
    {
      dancer_id: dancer.id,
      profile_id: dancer.profile_id,
      stage: STAGE,
      email,
      subject,
      status: res.ok ? "sent" : "failed",
      detail: res.ok ? { slug } : { slug, error: res.error ?? "unknown" },
      sent_at: new Date().toISOString(),
    },
    { onConflict: "dancer_id,stage" },
  );

  if (!res.ok) return { ok: false, skipped: res.error ?? "send_failed" };
  return { ok: true, email };
}

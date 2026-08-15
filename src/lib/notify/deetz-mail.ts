import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// deetz 공식 메일 양식(560px 카드 + SNS 아이콘 푸터)의 단일 렌더러.
// 기존 rejection-mail.ts 의 마크업을 그대로 파라미터화한 것 — 새 deetz 메일은 이걸 쓴다.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PillTone = "neutral" | "ok" | "pending";

const PILL_STYLES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: "#f1f1f3", fg: "#6b7280" },
  ok: { bg: "#e7f6ec", fg: "#0f7b3f" },
  pending: { bg: "#fff4e5", fg: "#9a5b00" },
};

export type InfoRow = { label: string; value: string; strong?: boolean };

export function renderDeetzMail(params: {
  pill: string;
  pillTone?: PillTone;
  heading: string;
  /** 본문 문단. 각 항목이 <p> 하나, 배열 안 개행은 <br>. 1문장=1줄 원칙 유지. */
  bodyLines: string[];
  infoRows?: InfoRow[];
  /** 강조 안내 박스(예: "최종 확정이 아닙니다"). */
  noticeLines?: string[];
  cta?: { label: string; href: string };
  footerLines?: string[];
}): string {
  const {
    pill,
    pillTone = "neutral",
    heading,
    bodyLines,
    infoRows = [],
    noticeLines = [],
    cta,
    footerLines = [],
  } = params;
  const pillStyle = PILL_STYLES[pillTone];

  const bodyHtml = bodyLines
    .map(
      (line) =>
        `<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 10px;">${line}</p>`,
    )
    .join("");

  const infoHtml = infoRows.length
    ? `<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
    ${infoRows
      .map(
        (r) =>
          `<tr><td style="vertical-align:top;width:96px;color:#6b7280;font-size:13px;padding:6px 0;">${escapeHtml(r.label)}</td><td style="font-size:14px;line-height:1.6;color:${r.strong ? "#111111" : "#33363b"};font-weight:${r.strong ? 700 : 400};padding:6px 0;">${r.value}</td></tr>`,
      )
      .join("")}
    </tbody></table></div></td></tr>`
    : "";

  const noticeHtml = noticeLines.length
    ? `<tr><td style="padding:14px 32px 6px;">
  <div style="background:#fff8ec;border:1px solid #f2dfc0;border-radius:14px;padding:14px 18px;">
    ${noticeLines
      .map(
        (line) =>
          `<p style="font-size:14px;line-height:1.7;color:#7a4b00;margin:0 0 6px;">${line}</p>`,
      )
      .join("")}
  </div></td></tr>`
    : "";

  const ctaHtml = cta
    ? `<tr><td style="padding:16px 32px 24px;">
  <a href="${cta.href}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${escapeHtml(cta.label)} →</a></td></tr>`
    : `<tr><td style="padding:0 32px 24px;"></td></tr>`;

  const footerNoteHtml = footerLines.length
    ? `<tr><td style="padding:0 32px 20px;">
  <p style="font-size:13px;line-height:1.75;color:#6b7280;margin:0;">${footerLines.join("<br>")}</p></td></tr>`
    : "";

  return `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:${pillStyle.bg};color:${pillStyle.fg};font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(pill)}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 12px;line-height:1.5;">${heading}</p>
  ${bodyHtml}</td></tr>
${infoHtml}
${noticeHtml}
${footerNoteHtml}
${ctaHtml}
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 지원하신 주소로 발송되었습니다.</div></td></tr>
</table></td></tr></table></body></html>`;
}

// 지원 1건의 수신자(이메일·표시명) 해석. rejection-mail.ts 와 동일한 폴백 순서.
//   댄서 클레임 계정 → dancer_private_info.email → 지원 계정
export async function resolveApplicantContact(params: {
  applicantId: string | null;
  dancerId: string | null;
}): Promise<{ email: string | null; name: string }> {
  const { applicantId, dancerId } = params;
  const admin = createAdminClient();
  let email: string | null = null;
  let name = "지원자";

  if (dancerId) {
    const { data: d } = await admin
      .from("dancers")
      .select("stage_name, profile_id")
      .eq("id", dancerId)
      .maybeSingle();
    if (d?.stage_name) name = d.stage_name as string;
    if (d?.profile_id) {
      const { data: u } = await admin.auth.admin.getUserById(
        d.profile_id as string,
      );
      if (u?.user?.email) email = u.user.email;
    }
    if (!email) {
      const { data: priv } = await admin
        .from("dancer_private_info")
        .select("email")
        .eq("dancer_id", dancerId)
        .maybeSingle();
      if (priv?.email) email = priv.email as string;
    }
  }

  if (!email && applicantId) {
    const { data: u } = await admin.auth.admin.getUserById(applicantId);
    if (u?.user?.email) email = u.user.email;
  }
  if (name === "지원자" && applicantId) {
    const { data: p } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", applicantId)
      .maybeSingle();
    if (p?.display_name) name = p.display_name as string;
  }

  return { email, name };
}

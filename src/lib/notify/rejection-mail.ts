import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 지원 거절 시 댄서에게 거절 안내 메일 발송 (발신 = GMAIL_USER = dancers.bio.kr@gmail.com).
// 수신 이메일이 없으면(미claim·이메일 없음) 조용히 skip. 비치명적.
export async function sendApplicationRejectionEmail(params: {
  applicantId: string | null;
  dancerId: string | null;
  projectId: string | null;
  reason: string | null;
}): Promise<{ ok: boolean; skipped?: string }> {
  const { applicantId, dancerId, projectId, reason } = params;
  const admin = createAdminClient();

  let email: string | null = null;
  let name = "지원자";

  // 어떤 프로젝트에 대한 거절인지 메일에 명시.
  let projectTitle = "";
  if (projectId) {
    const { data: proj } = await admin
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();
    projectTitle = (proj?.title as string | null) ?? "";
  }

  // 댄서 활동명 + 클레임 계정 이메일
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

  // 지원 계정 이메일 (폴백)
  if (!email && applicantId) {
    const { data: u } = await admin.auth.admin.getUserById(applicantId);
    if (u?.user?.email) email = u.user.email;
    if (name === "지원자") {
      const { data: p } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", applicantId)
        .maybeSingle();
      if (p?.display_name) name = p.display_name as string;
    }
  }

  if (!email) return { ok: false, skipped: "no_email" };

  const safeName = escapeHtml(name);
  const reasonClean = reason && reason.trim() ? reason.trim() : null;
  const titleClean = projectTitle.trim();
  const subjectSuffix = titleClean ? ` - ${titleClean}` : "";

  // deetz(dancers.bio) 메일 디자인·서명에 맞춤(온보딩 메일 기준). 1문장=1줄.
  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    `deetz를 통해 지원해 주셔서 진심으로 감사합니다.`,
    ...(titleClean ? [``, `지원 프로젝트: ${titleClean}`] : []),
    ...(reasonClean ? [`거절 사유: ${reasonClean}`] : []),
    ``,
    `신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.`,
    `보내주신 관심과 노력에 깊이 감사드립니다.`,
    `더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.`,
    ``,
    `감사합니다.`,
    ``,
    `다른 캐스팅 둘러보기: https://deetz.kr/feed`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · dancers.bio.kr@gmail.com`,
    `Instagram instagram.com/deetz_magazine · YouTube youtube.com/@deetzmagazine`,
  ].join("\n");

  // 실제 발송 중인 deetz "프로필 승인" 메일과 동일 양식(560px 카드 + SNS 아이콘 푸터).
  const reasonRow = reasonClean
    ? `<tr><td style="vertical-align:top;width:88px;color:#6b7280;font-size:13px;padding:8px 0 0;">거절 사유</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:8px 0 0;">${escapeHtml(reasonClean)}</td></tr>`
    : "";

  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#f1f1f3;color:#6b7280;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">지원 결과 안내</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${safeName}님, 안녕하세요.</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">deetz를 통해 지원해 주셔서 진심으로 감사합니다.<br>신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
    <tr><td style="vertical-align:top;width:88px;color:#6b7280;font-size:13px;">지원 프로젝트</td><td style="font-size:14px;font-weight:700;line-height:1.5;color:#111111;">${titleClean ? escapeHtml(titleClean) : "-"}</td></tr>
    ${reasonRow}
    </tbody></table></div></td></tr>
<tr><td style="padding:14px 32px 6px;">
  <p style="font-size:14px;line-height:1.75;color:#44474d;margin:0;">보내주신 관심과 노력에 깊이 감사드립니다.<br>더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.</p></td></tr>
<tr><td style="padding:16px 32px 24px;">
  <a href="https://deetz.kr/feed" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">다른 캐스팅 둘러보기 →</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:dancers.bio.kr@gmail.com" style="color:#44474d;text-decoration:none;">dancers.bio.kr@gmail.com</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 지원하신 주소로 발송되었습니다.</div></td></tr>
</table></td></tr></table></body></html>`;

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] 지원 결과 안내${subjectSuffix}`,
    text,
    html,
  });
  return { ok: res.ok };
}

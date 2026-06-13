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

  // 기존 deetz(dancers.bio) + 그리고엔터(contact@grigoent) 메일 디자인·서명 참고. 1문장=1줄.
  const text = [
    `안녕하세요 ${name}님,`,
    `그리고 엔터테인먼트(deetz)입니다.`,
    ``,
    `deetz를 통해 지원해 주셔서 진심으로 감사합니다.`,
    ...(titleClean ? [`지원 프로젝트: ${titleClean}`] : []),
    ``,
    `신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.`,
    ...(reasonClean ? [`거절 사유: ${reasonClean}`] : []),
    ``,
    `보내주신 관심과 노력에 깊이 감사드립니다.`,
    `더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.`,
    ``,
    `감사합니다.`,
    ``,
    `그리고 엔터테인먼트`,
    `(주)그리고 엔터테인먼트`,
    `사업자등록번호 116-81-96848 | 서울특별시 마포구 성지3길 55, 3층`,
    `연락처 02-6229-9229 | dancers.bio.kr@gmail.com`,
    `deetz · 한국 댄스 신을 위한 프로필 & 캐스팅 플랫폼`,
  ].join("\n");

  const infoRows =
    `<tr><td style="padding:12px 16px;background:#f5f5f5;border-bottom:1px solid #e8e8e8;font-size:13px;color:#666;width:96px;">지원 프로젝트</td><td style="padding:12px 16px;background:#f5f5f5;border-bottom:1px solid #e8e8e8;font-size:14px;font-weight:600;color:#111;">${titleClean ? escapeHtml(titleClean) : "-"}</td></tr>` +
    (reasonClean
      ? `<tr><td style="padding:12px 16px;background:#f5f5f5;font-size:13px;color:#666;vertical-align:top;">거절 사유</td><td style="padding:12px 16px;background:#f5f5f5;font-size:14px;color:#222;line-height:1.6;">${escapeHtml(reasonClean)}</td></tr>`
      : "");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Apple SD Gothic Neo','Malgun Gothic','Helvetica Neue',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="padding:36px 40px 0;">
    <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#111;">deetz<span style="color:#6366f1;">.</span></div>
    <div style="border-bottom:2.5px solid #111;margin-top:16px;"></div>
  </div>
  <div style="padding:28px 40px 36px;">
    <div style="font-size:15px;color:#111;line-height:1.8;">안녕하세요, <strong>${safeName}</strong>님.</div>
    <div style="font-size:14px;color:#111;margin-top:2px;line-height:1.8;">그리고 엔터테인먼트(deetz)입니다.</div>
    <div style="font-size:14px;color:#444;margin-top:16px;line-height:1.8;">deetz를 통해 지원해 주셔서 진심으로 감사합니다.</div>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;" cellpadding="0" cellspacing="0">
      ${infoRows}
    </table>

    <div style="font-size:14px;color:#444;line-height:1.8;">신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.</div>
    <div style="font-size:14px;color:#444;margin-top:14px;line-height:1.8;">보내주신 관심과 노력에 깊이 감사드립니다.</div>
    <div style="font-size:14px;color:#444;line-height:1.8;">더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.</div>
    <div style="font-size:14px;color:#111;margin-top:16px;line-height:1.8;">감사합니다.</div>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #eee;">
    <div style="font-size:13px;font-weight:700;color:#111;">그리고 엔터테인먼트</div>
    <div style="font-size:11px;color:#888;margin-top:4px;line-height:1.6;">
      (주)그리고 엔터테인먼트<br/>
      사업자등록번호 116-81-96848 | 서울특별시 마포구 성지3길 55, 3층<br/>
      연락처 02-6229-9229 | dancers.bio.kr@gmail.com<br/>
      deetz · 한국 댄스 신을 위한 프로필 &amp; 캐스팅 플랫폼
    </div>
  </div>
</div>
</body>
</html>`;

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] 지원 결과 안내${subjectSuffix}`,
    text,
    html,
  });
  return { ok: res.ok };
}

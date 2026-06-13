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
    `— deetz 팀`,
    ``,
    `deetz · 한국 댄스 신을 위한 프로필 & 캐스팅 플랫폼`,
  ].join("\n");

  const infoBox = `<div style="margin:18px 0;padding:16px 18px;background:#fafafa;border:1px solid #eee;border-radius:12px;font-size:14px;color:#222;line-height:1.8;">
    <div>지원 프로젝트 &nbsp;<b>${titleClean ? escapeHtml(titleClean) : "-"}</b></div>${
      reasonClean
        ? `\n    <div style="margin-top:6px;"><span style="color:#888;">거절 사유</span> &nbsp;${escapeHtml(reasonClean)}</div>`
        : ""
    }
  </div>`;

  const html = `<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111111;padding:8px 4px;">
  <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;padding:8px 0;">deetz<span style="color:#6366f1;">.</span></div>
  <p style="font-size:14px;line-height:1.7;color:#222;">안녕하세요 ${safeName}님,</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">deetz를 통해 지원해 주셔서 진심으로 감사합니다.</p>
  ${infoBox}
  <p style="font-size:14px;line-height:1.7;color:#444;">신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">보내주신 관심과 노력에 깊이 감사드립니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#222;margin-top:16px;">감사합니다.<br>— deetz 팀</p>
  <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;">
  <p style="font-size:11px;color:#bbbbbb;">deetz · 한국 댄스 신을 위한 프로필 &amp; 캐스팅 플랫폼</p>
</div>`;

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] 지원 결과 안내${subjectSuffix}`,
    text,
    html,
  });
  return { ok: res.ok };
}

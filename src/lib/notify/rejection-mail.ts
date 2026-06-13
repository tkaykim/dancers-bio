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
  reason: string | null;
}): Promise<{ ok: boolean; skipped?: string }> {
  const { applicantId, dancerId, reason } = params;
  const admin = createAdminClient();

  let email: string | null = null;
  let name = "지원자";

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

  const lines: string[] = [
    `안녕하세요, ${name}님.`,
    `deetz를 통해 소중한 지원을 보내주셔서 진심으로 감사합니다.`,
    ``,
    `신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.`,
  ];
  if (reason && reason.trim()) {
    lines.push(``, `사유: ${reason.trim()}`);
  }
  lines.push(
    ``,
    `보내주신 관심과 노력에 깊이 감사드립니다.`,
    `더 좋은 기회로 다시 만나뵐 수 있기를 바라며, 앞으로의 활동을 진심으로 응원합니다.`,
    ``,
    `감사합니다.`,
    `deetz 드림`,
  );

  const text = lines.join("\n");
  const html = lines.map((l) => (l === "" ? "<br>" : escapeHtml(l))).join("<br>");

  const res = await sendGmailEmail({
    to: email,
    subject: "[deetz] 지원 결과 안내",
    text,
    html,
  });
  return { ok: res.ok };
}

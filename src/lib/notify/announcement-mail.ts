import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  escapeHtml,
  renderDeetzMail,
  resolveApplicantContact,
} from "@/lib/notify/deetz-mail";
import { toParagraphs } from "@/lib/application-stage";

// 공지 메일. 단계 안내와 달리 문구가 전부 운영자 작성이라 본문을 그대로 싣는다.
// 양식(560px 카드 + SNS 푸터)만 deetz 정본을 따른다.
//
// 같은 공지를 같은 사람에게 두 번 보내지 않도록, 발송 권한을 로그에 먼저 선점한다.
// (단계 안내와 동일한 claim-then-send 패턴 — 조회 후 발송은 동시 요청에서 중복이 난다.)
export async function sendAnnouncementEmail(params: {
  applicantId: string | null;
  dancerId: string | null;
  projectId: string;
  projectTitle: string;
  title: string;
  body: string;
  channel: string;
}): Promise<{ ok: boolean; skipped?: string }> {
  const { applicantId, projectId, projectTitle, title, body, channel } = params;
  if (!applicantId) return { ok: false, skipped: "no_applicant" };

  const admin = createAdminClient();
  const { error: claimErr } = await admin
    .from("project_notification_log")
    .insert({ project_id: projectId, recipient_id: applicantId, channel });
  if (claimErr) {
    if (claimErr.code === "23505") return { ok: true, skipped: "already_sent" };
    console.error("[announcement-mail] 이력 선점 실패:", claimErr.message);
  }

  const releaseClaim = async () => {
    await admin
      .from("project_notification_log")
      .delete()
      .eq("project_id", projectId)
      .eq("recipient_id", applicantId)
      .eq("channel", channel);
  };

  const { email, name } = await resolveApplicantContact(params);
  if (!email) {
    await releaseClaim();
    return { ok: false, skipped: "no_email" };
  }

  const titleClean = title.trim();
  const bodyLines = toParagraphs(body).map(escapeHtml);

  const html = renderDeetzMail({
    pill: "공지",
    pillTone: "neutral",
    heading: titleClean ? escapeHtml(titleClean) : `${escapeHtml(name)}님께 안내드립니다.`,
    bodyLines: bodyLines.length ? bodyLines : ["(내용 없음)"],
    infoRows: projectTitle
      ? [{ label: "프로젝트", value: escapeHtml(projectTitle), strong: true }]
      : [],
    cta: { label: "내 지원 현황 보기", href: "https://deetz.kr/applications" },
  });

  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    ...(titleClean ? [`[${titleClean}]`, ``] : []),
    ...toParagraphs(body),
    ...(projectTitle ? [``, `프로젝트: ${projectTitle}`] : []),
    ``,
    `내 지원 현황: https://deetz.kr/applications`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] ${titleClean || "공지"}${projectTitle ? ` - ${projectTitle}` : ""}`,
    text,
    html,
  });
  if (!res.ok) await releaseClaim();
  return { ok: res.ok };
}

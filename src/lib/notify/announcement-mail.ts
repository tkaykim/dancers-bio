import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  escapeHtml,
  renderDeetzMail,
  resolveApplicantContact,
} from "@/lib/notify/deetz-mail";
import { toParagraphs } from "@/lib/application-stage";
import { getOrCreatePrefs } from "@/lib/notify/notification-preferences";
import { mailTranslator } from "@/lib/i18n/mail-messages";
import { projectLocale } from "@/lib/i18n/project-locale";

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

  // 본문(title/body)은 운영자가 쓴 글이라 그대로 싣는다. 껍데기만 공고 언어를 따른다.
  const locale = await projectLocale(projectId);
  const mt = mailTranslator(locale);

  const { email, name } = await resolveApplicantContact(params, locale);
  if (!email) {
    await releaseClaim();
    return { ok: false, skipped: "no_email" };
  }

  const titleClean = title.trim();
  const bodyLines = toParagraphs(body).map(escapeHtml);

  const html = renderDeetzMail({
    locale,
    pill: mt("mail.announce.pill"),
    pillTone: "neutral",
    heading: escapeHtml(
      titleClean || mt("mail.announce.heading_fallback", { name }),
    ),
    bodyLines: bodyLines.length ? bodyLines : [mt("mail.announce.empty")],
    infoRows: projectTitle
      ? [
          {
            label: mt("mail.common.project"),
            value: escapeHtml(projectTitle),
            strong: true,
          },
        ]
      : [],
    cta: {
      label: mt("mail.stage.cta"),
      href: "https://deetz.kr/applications",
    },
  });

  const text = [
    mt("mail.text.greeting", { name }),
    ``,
    ...(titleClean ? [`[${titleClean}]`, ``] : []),
    ...toParagraphs(body),
    ...(projectTitle ? [``, `${mt("mail.common.project")}: ${projectTitle}`] : []),
    ``,
    `${mt("mail.stage.text_applications")}: https://deetz.kr/applications`,
    ``,
    mt("mail.signature.line1"),
    mt("mail.signature.line2"),
  ].join("\n");

  // 운영자가 쓴 브로드캐스트라 안내성(bulk)으로 본다 — 지원 결과 통지와 달리
  // 같은 사람에게 여러 번 나가고, 내용도 수신자가 직접 일으킨 사건이 아니다.
  let unsubscribeToken: string | null = null;
  try {
    unsubscribeToken = (await getOrCreatePrefs(applicantId)).unsubscribe_token;
  } catch {
    // 토큰을 못 얻어도 발송은 계속한다 — 그 경우 mailto 수신거부만 붙는다.
  }

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] ${titleClean || mt("mail.announce.subject_fallback")}${projectTitle ? ` - ${projectTitle}` : ""}`,
    text,
    html,
    bulk: true,
    unsubscribeToken,
  });
  if (!res.ok) await releaseClaim();
  return { ok: res.ok };
}

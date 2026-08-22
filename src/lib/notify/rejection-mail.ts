import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  escapeHtml,
  renderDeetzMail,
  resolveApplicantContact,
} from "@/lib/notify/deetz-mail";
import { mailTranslator } from "@/lib/i18n/mail-messages";
import { projectLocale } from "@/lib/i18n/project-locale";

export const REJECTION_CHANNEL = "stage_reject";

// 지원 거절 안내.
//
// 거절 사유는 메일에 싣지 않는다(대표 지시 2026-08-16). 운영자가 내부 메모처럼 적은
// 문장이 그대로 지원자에게 가는 사고를 막기 위해서다. rejection_reason 은 DB 에만 남는다.
//
// 대신 다음 기회의 성사율을 올리는 실질적인 안내를 담는다 — 프로필을 채우면 캐스팅
// 확률이 오르고, 직접 정리하기 어려우면 이 메일로 자료만 보내도 대신 채워준다.
export async function sendApplicationRejectionEmail(params: {
  applicantId: string | null;
  dancerId: string | null;
  projectId: string | null;
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const { applicantId, projectId } = params;
  if (!applicantId || !projectId) return { ok: false, skipped: "no_target" };

  const admin = createAdminClient();

  // 같은 공고의 거절 안내는 1인 1통. 거절→대기→거절을 반복해도 다시 나가지 않는다.
  const { error: claimErr } = await admin
    .from("project_notification_log")
    .insert({
      project_id: projectId,
      recipient_id: applicantId,
      channel: REJECTION_CHANNEL,
    });
  if (claimErr) {
    if (claimErr.code === "23505") return { ok: true, skipped: "already_sent" };
    console.error("[reject-mail] 이력 선점 실패:", claimErr.message);
  }
  const releaseClaim = async () => {
    await admin
      .from("project_notification_log")
      .delete()
      .eq("project_id", projectId)
      .eq("recipient_id", applicantId)
      .eq("channel", REJECTION_CHANNEL);
  };

  // 문구 언어는 공고 본문이 정한다. 영문 공고에 한국어 안내가 나가면
  // 지원자는 결과가 무엇인지조차 알 수 없다(4wbhr5 China Tour 에서 35통이 그렇게 나갔다).
  const locale = await projectLocale(projectId);
  const mt = mailTranslator(locale);

  const { email, name } = await resolveApplicantContact(params, locale);
  if (!email) {
    await releaseClaim();
    return { ok: false, skipped: "no_email" };
  }

  const { data: proj } = await admin
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();
  const projectTitle = ((proj?.title as string | null) ?? "").trim();
  const subjectSuffix = projectTitle ? ` - ${projectTitle}` : "";

  const noticeText = [
    mt("mail.reject.notice_1"),
    mt("mail.reject.notice_2"),
    mt("mail.reject.notice_3"),
  ];
  const footerText = [
    mt("mail.reject.footer_1"),
    mt("mail.reject.footer_2"),
    mt("mail.reject.footer_3"),
  ];
  const bodyText = [mt("mail.reject.body_1"), mt("mail.reject.body_2")];

  const html = renderDeetzMail({
    locale,
    pill: mt("mail.reject.pill"),
    pillTone: "neutral",
    heading: escapeHtml(mt("mail.common.hello", { name })),
    bodyLines: bodyText.map(escapeHtml),
    infoRows: [
      {
        label: mt("mail.stage.row_project"),
        value: projectTitle ? escapeHtml(projectTitle) : "-",
        strong: true,
      },
    ],
    // 첫 줄만 강조한다 — 이 메일의 핵심은 "프로필을 채우면 다음이 열린다"다.
    noticeLines: noticeText.map((line, i) =>
      i === 0 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line),
    ),
    footerLines: footerText.map(escapeHtml),
    cta: { label: mt("mail.reject.cta"), href: "https://deetz.kr/me" },
  });

  const text = [
    mt("mail.text.greeting", { name }),
    ``,
    ...bodyText,
    ...(projectTitle
      ? [``, `${mt("mail.stage.row_project")}: ${projectTitle}`]
      : []),
    ``,
    ...noticeText,
    ``,
    footerText[0],
    footerText[1],
    ``,
    footerText[2],
    ``,
    `${mt("mail.reject.text_profile")}: https://deetz.kr/me`,
    `${mt("mail.reject.text_feed")}: https://deetz.kr/feed`,
    ``,
    mt("mail.signature.line1"),
    mt("mail.signature.line2"),
    mt("mail.signature.social"),
  ].join("\n");

  const res = await sendGmailEmail({
    to: email,
    subject: `${mt("mail.reject.subject")}${subjectSuffix}`,
    text,
    html,
  });
  if (!res.ok) await releaseClaim();
  return { ok: res.ok, error: res.error };
}

import "server-only";

import { sendGmailEmail } from "@/lib/gmail";
import { renderDeetzMail, resolveApplicantContact } from "@/lib/notify/deetz-mail";
import { getOrCreatePrefs } from "@/lib/notify/notification-preferences";
import { escapeHtml } from "@/lib/notify/deetz-mail";
import { previewText } from "@/lib/messaging/types";

// 메시지 센터 메일 2종.
// 원칙: 메일에는 요지+딥링크만 — 본문 전문을 담아 회신이 메일함으로 돌아오는
// 8월 사고 경로를 재생산하지 않는다. 도달의 정본은 앱의 last_read_seq 이고,
// SMTP 성공은 "접수"이지 "도달"이 아니다.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

/** 수신 가능 여부(계정 존재 + 전체 수신거부 아님) + 주소 해석. */
export async function resolveMemberMailTarget(params: {
  dancerId: string;
  memberUserId: string | null;
}): Promise<
  | { ok: true; email: string; name: string }
  | { ok: false; reason: "no_account" | "unsubscribed" | "no_email" }
> {
  if (!params.memberUserId) return { ok: false, reason: "no_account" };
  const prefs = await getOrCreatePrefs(params.memberUserId);
  if (prefs.email_unsubscribed_all) return { ok: false, reason: "unsubscribed" };
  const contact = await resolveApplicantContact({
    applicantId: params.memberUserId,
    dancerId: params.dancerId,
  });
  if (!contact.email) return { ok: false, reason: "no_email" };
  return { ok: true, email: contact.email, name: contact.name };
}

/** 미읽음 재촉 메일 — 내용은 싣지 않는다(요지+링크). */
export async function sendUnreadNudgeMail(params: {
  email: string;
  name: string;
  projectTitle: string;
  roomId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const html = renderDeetzMail({
    pill: "메시지",
    heading: "확인하지 않은 메시지가 있습니다",
    bodyLines: [
      `${escapeHtml(params.name)}님, 진행 중인 프로젝트의 운영팀 메시지가 도착해 있습니다.`,
      "일정·선발 관련 안내일 수 있으니 앱에서 확인해 주세요.",
    ],
    infoRows: [{ label: "프로젝트", value: escapeHtml(params.projectTitle), strong: true }],
    cta: { label: "메시지 확인하기", href: `${SITE_URL}/messages/${params.roomId}` },
    footerLines: [
      "이 메일은 메시지를 1시간 이상 확인하지 않은 경우에만 발송됩니다.",
      "회신은 메일이 아니라 앱의 대화방에서 해주세요.",
    ],
  });
  return sendGmailEmail({
    to: params.email,
    subject: `[deetz] ${params.projectTitle} — 확인하지 않은 메시지가 있습니다`,
    html,
    text: `${params.projectTitle} 운영팀의 메시지가 도착해 있습니다. ${SITE_URL}/messages/${params.roomId} 에서 확인해 주세요.`,
  });
}

/** 캠페인 병행 메일 — 제목+본문 요지+딥링크(전문은 앱에서). */
export async function sendCampaignMail(params: {
  email: string;
  name: string;
  projectTitle: string;
  campaignTitle: string;
  body: string;
  roomId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const snippet = previewText(params.body, 160);
  const html = renderDeetzMail({
    pill: "안내",
    heading: escapeHtml(params.campaignTitle || "프로젝트 안내"),
    bodyLines: [
      `${escapeHtml(params.name)}님, 지원하신 프로젝트의 운영팀 안내가 도착했습니다.`,
      escapeHtml(snippet),
      "전체 내용 확인과 응답은 앱의 대화방에서 해주세요.",
    ],
    infoRows: [{ label: "프로젝트", value: escapeHtml(params.projectTitle), strong: true }],
    cta: { label: "메시지 확인하기", href: `${SITE_URL}/messages/${params.roomId}` },
    footerLines: ["회신은 메일이 아니라 앱의 대화방에서 해주세요."],
  });
  return sendGmailEmail({
    to: params.email,
    subject: `[deetz] ${params.projectTitle} — ${params.campaignTitle || "안내"}`,
    html,
    text: `${params.projectTitle}: ${snippet} — ${SITE_URL}/messages/${params.roomId}`,
  });
}

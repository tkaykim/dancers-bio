import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  escapeHtml,
  renderDeetzMail,
  resolveApplicantContact,
} from "@/lib/notify/deetz-mail";

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
}): Promise<{ ok: boolean; skipped?: string }> {
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

  const { email, name } = await resolveApplicantContact(params);
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
  const safeName = escapeHtml(name);
  const subjectSuffix = projectTitle ? ` - ${projectTitle}` : "";

  const html = renderDeetzMail({
    pill: "지원 결과 안내",
    pillTone: "neutral",
    heading: `${safeName}님, 안녕하세요.`,
    bodyLines: [
      "deetz를 통해 지원해 주셔서 진심으로 감사합니다.",
      "신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.",
    ],
    infoRows: [
      {
        label: "지원 프로젝트",
        value: projectTitle ? escapeHtml(projectTitle) : "-",
        strong: true,
      },
    ],
    noticeLines: [
      "<strong>프로필을 채워두시면 다음 캐스팅에서 성사될 확률이 올라갑니다.</strong>",
      "프로필 사진, 주요 경력, 춤 영상, 인스타그램 연결이 특히 큰 영향을 줍니다.",
      "캐스팅을 의뢰하는 클라이언트가 이 정보를 보고 후보를 추리기 때문입니다.",
    ],
    footerLines: [
      "직접 정리하시기 번거로우시면, 이 메일로 회신만 주셔도 됩니다.",
      "프로필 사진, 포트폴리오 파일, 또는 경력을 정리한 텍스트를 보내주시면 저희가 프로필에 대신 업데이트해 드립니다.",
      "보내주신 관심과 노력에 깊이 감사드리며, 더 좋은 기회로 다시 만나뵙기를 바랍니다.",
    ],
    cta: { label: "내 프로필 채우러 가기", href: "https://deetz.kr/me" },
  });

  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    `deetz를 통해 지원해 주셔서 진심으로 감사합니다.`,
    `신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.`,
    ...(projectTitle ? [``, `지원 프로젝트: ${projectTitle}`] : []),
    ``,
    `프로필을 채워두시면 다음 캐스팅에서 성사될 확률이 올라갑니다.`,
    `프로필 사진, 주요 경력, 춤 영상, 인스타그램 연결이 특히 큰 영향을 줍니다.`,
    `캐스팅을 의뢰하는 클라이언트가 이 정보를 보고 후보를 추리기 때문입니다.`,
    ``,
    `직접 정리하시기 번거로우시면, 이 메일로 회신만 주셔도 됩니다.`,
    `프로필 사진, 포트폴리오 파일, 또는 경력을 정리한 텍스트를 보내주시면 저희가 프로필에 대신 업데이트해 드립니다.`,
    ``,
    `보내주신 관심과 노력에 깊이 감사드리며, 더 좋은 기회로 다시 만나뵙기를 바랍니다.`,
    ``,
    `내 프로필: https://deetz.kr/me`,
    `다른 캐스팅 둘러보기: https://deetz.kr/feed`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
    `Instagram instagram.com/deetz.kr · YouTube youtube.com/@deetzmagazine`,
  ].join("\n");

  const res = await sendGmailEmail({
    to: email,
    subject: `[deetz] 지원 결과 안내${subjectSuffix}`,
    text,
    html,
  });
  if (!res.ok) await releaseClaim();
  return { ok: res.ok };
}

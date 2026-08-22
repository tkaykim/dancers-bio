import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import {
  escapeHtml,
  renderDeetzMail,
  resolveApplicantContact,
} from "@/lib/notify/deetz-mail";
import {
  normalizeRounds,
  roundLabel,
  toParagraphs,
} from "@/lib/application-stage";
import { mailTranslator } from "@/lib/i18n/mail-messages";
import { projectLocale } from "@/lib/i18n/project-locale";

type SendResult = { ok: boolean; skipped?: string; error?: string };

// 단계 안내 메일 이력. project_notification_log 의 PK(project_id, recipient_id, channel)를
// 그대로 멱등키로 쓴다 — 같은 단계 안내가 두 번 나가지 않는다.
export function stageChannel(round: number): string {
  return `stage_r${round}`;
}

// 발송 "권한"을 먼저 선점한다 — 조회 후 발송하면 동시 요청 둘 다 미발송으로 보고
// 같은 안내가 두 번 나간다. PK(project_id, recipient_id, channel) 충돌이 원자적 잠금 역할을 한다.
// 발송에 실패하면 선점을 풀어 다음 시도가 가능하게 한다(블라스트 스크립트와 동일 패턴).
async function claimSend(
  projectId: string,
  recipientId: string,
  channel: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("project_notification_log")
    .insert({ project_id: projectId, recipient_id: recipientId, channel });
  if (!error) return true;
  if (error.code === "23505") return false; // 이미 보냈거나 다른 요청이 선점
  // 로그 테이블 장애로 안내 자체를 막지는 않는다.
  console.error("[stage-mail] 발송 이력 선점 실패:", error.message);
  return true;
}

async function releaseClaim(
  projectId: string,
  recipientId: string,
  channel: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("project_notification_log")
    .delete()
    .eq("project_id", projectId)
    .eq("recipient_id", recipientId)
    .eq("channel", channel);
}

async function getProjectTitle(projectId: string | null): Promise<string> {
  if (!projectId) return "";
  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();
  return ((data?.title as string | null) ?? "").trim();
}

/** 강조는 사전이 아니라 여기서 감싼다 — 같은 문장을 HTML 과 text 양쪽에 쓰기 위해서. */
const strong = (line: string) => `<strong>${line}</strong>`;

// ───────────────────────────────────────────────────── 단계 통과 안내 (중간/최종)
//
// 중간 단계에서는 "아직 최종이 아니다"를 제목·pill·안내박스 세 군데에서 반복한다.
// 마지막 단계에서는 "이제부터 직접 포기 불가"를 알린다.
export async function sendStageEmail(params: {
  applicantId: string | null;
  dancerId: string | null;
  projectId: string | null;
  round: number;
  totalRounds: number;
  roundLabels?: string[] | null;
  /** 공고별 본문 덮어쓰기(줄바꿈=문단). 비우면 기본 문구. */
  bodyOverride?: string | null;
  /** 경고 박스 아래 붙는 공고별 추가 안내. */
  note?: string | null;
}): Promise<SendResult> {
  const { applicantId, projectId, round, note, bodyOverride } = params;
  if (!projectId || !applicantId) return { ok: false, skipped: "no_target" };
  if (round < 1) return { ok: false, skipped: "not_a_pass" };

  const channel = stageChannel(round);
  if (!(await claimSend(projectId, applicantId, channel))) {
    return { ok: true, skipped: "already_sent" };
  }

  // 문구 언어는 공고 본문이 정한다. 영문 공고에 한국어 안내가 나가면
  // 지원자는 합격인지 아닌지조차 알 수 없다(4wbhr5 China Tour 에서 실제로 발생).
  const locale = await projectLocale(projectId);
  const mt = mailTranslator(locale);

  const { email, name } = await resolveApplicantContact(params, locale);
  if (!email) {
    await releaseClaim(projectId, applicantId, channel);
    return { ok: false, skipped: "no_email" };
  }

  const total = normalizeRounds(params.totalRounds);
  const cfg = {
    selection_rounds: total,
    round_labels: params.roundLabels ?? null,
  };
  const isFinal = round >= total;
  const label = roundLabel(round, cfg, locale);
  const nextLabel = isFinal ? null : roundLabel(round + 1, cfg, locale);

  const title = await getProjectTitle(projectId);
  const noteClean = note?.trim() || null;

  // 공고별 본문이 있으면 기본 문구 대신 쓴다. 경고 박스는 아래에서 항상 붙는다.
  // 덮어쓰기 문구는 운영자가 직접 쓴 글이라 번역하지 않고 그대로 내보낸다.
  const customBody = toParagraphs(bodyOverride);
  const defaultBody = isFinal
    ? [mt("mail.stage.body_final_1"), mt("mail.stage.body_final_2")]
    : [mt("mail.stage.body_round_1"), mt("mail.stage.body_round_2", { label })];
  const bodyLinesText = customBody.length ? customBody : defaultBody;
  const bodyLines = bodyLinesText.map(escapeHtml);

  const stageValue = mt("mail.stage.stage_value", { label, round, total });
  const noticeText = isFinal
    ? [
        mt("mail.stage.notice_final_1"),
        mt("mail.stage.notice_final_2"),
        mt("mail.stage.notice_final_3"),
      ]
    : [
        mt("mail.stage.notice_round_1"),
        mt("mail.stage.notice_round_2", {
          next: nextLabel ?? label,
        }),
        mt("mail.stage.notice_round_3"),
      ];
  const footerText = isFinal
    ? []
    : [mt("mail.stage.footer_round_1"), mt("mail.stage.footer_round_2")];

  const html = renderDeetzMail({
    locale,
    pill: isFinal
      ? escapeHtml(label)
      : escapeHtml(mt("mail.stage.pill_not_final", { label })),
    pillTone: isFinal ? "ok" : "pending",
    heading: escapeHtml(
      isFinal
        ? mt("mail.stage.heading_final", { name })
        : mt("mail.stage.heading_round", { name, label }),
    ),
    bodyLines,
    infoRows: [
      {
        label: mt("mail.stage.row_project"),
        value: title ? escapeHtml(title) : "-",
        strong: true,
      },
      {
        label: mt("mail.stage.row_stage"),
        value: escapeHtml(total > 1 ? stageValue : label),
      },
    ],
    // 첫 줄만 강조한다 — 최종이면 "직접 포기 불가", 중간이면 "최종 아님"이 핵심이다.
    noticeLines: noticeText.map((line, i) =>
      i === 0 ? strong(escapeHtml(line)) : escapeHtml(line),
    ),
    footerLines: [
      ...(noteClean ? [escapeHtml(noteClean)] : []),
      ...footerText.map(escapeHtml),
    ],
    cta: {
      label: mt("mail.stage.cta"),
      href: "https://deetz.kr/applications",
    },
  });

  const text = [
    mt("mail.text.greeting", { name }),
    ``,
    ...bodyLinesText,
    ...(title ? [``, `${mt("mail.stage.row_project")}: ${title}`] : []),
    `${mt("mail.stage.row_stage")}: ${total > 1 ? stageValue : label}`,
    ``,
    // HTML 쪽 강조와 같은 자리에 [중요] 를 붙인다.
    ...noticeText.map((line, i) =>
      i === 0 && !isFinal ? `${mt("mail.text.important_prefix")}${line}` : line,
    ),
    ...(footerText.length ? [``, ...footerText] : []),
    ...(noteClean ? [``, noteClean] : []),
    ``,
    `${mt("mail.stage.text_applications")}: https://deetz.kr/applications`,
    ``,
    mt("mail.signature.line1"),
    mt("mail.signature.line2"),
  ].join("\n");

  const res = await sendGmailEmail({
    to: email,
    subject:
      (isFinal
        ? mt("mail.stage.subject_final")
        : mt("mail.stage.subject_round", { label })) +
      (title ? ` - ${title}` : ""),
    text,
    html,
  });
  if (!res.ok) await releaseClaim(projectId, applicantId, channel);
  return { ok: res.ok, error: res.error };
}

// ───────────────────────────────────────────── 본인 포기 → 운영자에게 즉시 알림
// 합격자가 빠지면 대체 인원을 바로 채워야 하므로 조용히 넘어가면 안 된다.
export async function sendSelfDeclineNotice(params: {
  projectId: string | null;
  applicantId: string | null;
  dancerId: string | null;
  reason: string | null;
}): Promise<SendResult> {
  const admin = createAdminClient();
  const { name } = await resolveApplicantContact(params);
  const title = await getProjectTitle(params.projectId);

  // 수신 = 프로젝트 소유자 + 공동관리자. 확보 실패 시 대표 채널로 폴백.
  const recipients = new Set<string>();
  if (params.projectId) {
    const { data: project } = await admin
      .from("projects")
      .select("owner_id")
      .eq("id", params.projectId)
      .maybeSingle();
    const { data: managers } = await admin
      .from("project_managers")
      .select("profile_id")
      .eq("project_id", params.projectId);

    const ids = [
      (project?.owner_id as string | null) ?? null,
      ...((managers ?? []) as Array<{ profile_id: string }>).map(
        (m) => m.profile_id,
      ),
    ].filter((id): id is string => !!id);

    for (const id of ids) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (u?.user?.email) recipients.add(u.user.email);
    }
  }
  if (recipients.size === 0) recipients.add("contact@deetz.kr");

  const reasonClean = params.reason?.trim() || null;
  const html = renderDeetzMail({
    pill: "합격자 포기",
    pillTone: "neutral",
    heading: "합격자가 참여를 포기했습니다.",
    bodyLines: ["대체 인원 검토가 필요한지 확인해 주세요."],
    infoRows: [
      { label: "프로젝트", value: title ? escapeHtml(title) : "-", strong: true },
      { label: "포기한 지원자", value: escapeHtml(name) },
      { label: "사유", value: reasonClean ? escapeHtml(reasonClean) : "(미입력)" },
    ],
    cta: params.projectId
      ? {
          label: "지원자 콘솔 열기",
          href: `https://deetz.kr/projects/${params.projectId}/applicants`,
        }
      : undefined,
  });

  const text = [
    `합격자가 참여를 포기했습니다.`,
    ``,
    `프로젝트: ${title || "-"}`,
    `포기한 지원자: ${name}`,
    `사유: ${reasonClean ?? "(미입력)"}`,
    ``,
    `대체 인원 검토가 필요한지 확인해 주세요.`,
  ].join("\n");

  const res = await sendGmailEmail({
    to: Array.from(recipients).join(", "),
    subject: `[deetz] 합격자 포기 - ${name}${title ? ` (${title})` : ""}`,
    text,
    html,
  });
  return { ok: res.ok };
}

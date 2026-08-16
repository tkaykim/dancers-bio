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

  const { email, name } = await resolveApplicantContact(params);
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
  const label = roundLabel(round, cfg);
  const nextLabel = isFinal ? null : roundLabel(round + 1, cfg);

  const title = await getProjectTitle(projectId);
  const safeName = escapeHtml(name);
  const noteClean = note?.trim() || null;

  // 공고별 본문이 있으면 기본 문구 대신 쓴다. 경고 박스는 아래에서 항상 붙는다.
  const customBody = toParagraphs(bodyOverride);
  const defaultBody = isFinal
    ? [
        "모든 선발 절차가 끝나 최종 합격하셨음을 안내드립니다.",
        "함께하게 되어 반갑습니다.",
      ]
    : [
        "deetz를 통해 지원해 주셔서 감사합니다.",
        `보내주신 프로필을 검토한 결과, ${label}하셨습니다.`,
      ];
  const bodyLinesText = customBody.length ? customBody : defaultBody;
  const bodyLines = bodyLinesText.map(escapeHtml);

  const html = renderDeetzMail({
    pill: isFinal ? escapeHtml(label) : `${escapeHtml(label)} (최종 확정 아님)`,
    pillTone: isFinal ? "ok" : "pending",
    heading: isFinal
      ? `${safeName}님, 최종 합격하셨습니다.`
      : `${safeName}님, ${escapeHtml(label)}을 안내드립니다.`,
    bodyLines,
    infoRows: [
      { label: "지원 프로젝트", value: title ? escapeHtml(title) : "-", strong: true },
      {
        label: "현재 단계",
        value: escapeHtml(
          total > 1 ? `${label} (${round}/${total}단계)` : label,
        ),
      },
    ],
    noticeLines: isFinal
      ? [
          "이 단계부터는 <strong>앱에서 직접 포기하실 수 없습니다.</strong>",
          "부득이한 사정이 생기면 즉시 contact@deetz.kr 로 알려주세요.",
          "확정 이후의 이탈은 클라이언트 일정과 다른 참여자에게 영향을 줍니다.",
        ]
      : [
          "<strong>이번 안내는 최종 합격이 아닙니다.</strong>",
          `다음 단계(${escapeHtml(nextLabel ?? "최종 합격")}) 결과에 따라 최종 진행이 되지 않을 수 있습니다.`,
          "결과가 나오는 대로 합격·불합격 여부와 관계없이 다시 안내드립니다.",
        ],
    footerLines: isFinal
      ? noteClean
        ? [escapeHtml(noteClean)]
        : []
      : [
          ...(noteClean ? [escapeHtml(noteClean)] : []),
          "일정이나 사정상 참여가 어려우시면, 아래 <strong>내 지원 현황</strong>에서 직접 포기하실 수 있습니다.",
          "최종 합격으로 확정된 경우에는 포기가 어려우니, 일정에 변동이 있으시다면 미리 반영 부탁드립니다.",
        ],
    cta: { label: "내 지원 현황 보기", href: "https://deetz.kr/applications" },
  });

  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    ...bodyLinesText,
    ...(title ? [``, `지원 프로젝트: ${title}`] : []),
    `현재 단계: ${total > 1 ? `${label} (${round}/${total}단계)` : label}`,
    ``,
    ...(isFinal
      ? [
          `이 단계부터는 앱에서 직접 포기하실 수 없습니다.`,
          `부득이한 사정이 생기면 즉시 contact@deetz.kr 로 알려주세요.`,
        ]
      : [
          `[중요] 이번 안내는 최종 합격이 아닙니다.`,
          `다음 단계(${nextLabel ?? "최종 합격"}) 결과에 따라 최종 진행이 되지 않을 수 있습니다.`,
          `결과가 나오는 대로 합격·불합격 여부와 관계없이 다시 안내드립니다.`,
          ``,
          `일정이나 사정상 참여가 어려우시면, 내 지원 현황에서 직접 포기하실 수 있습니다.`,
          `최종 합격으로 확정된 경우에는 포기가 어려우니, 일정에 변동이 있으시다면 미리 반영 부탁드립니다.`,
        ]),
    ...(noteClean ? [``, noteClean] : []),
    ``,
    `내 지원 현황: https://deetz.kr/applications`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");

  const res = await sendGmailEmail({
    to: email,
    subject: isFinal
      ? `[deetz] 최종 합격 안내${title ? ` - ${title}` : ""}`
      : `[deetz] ${label} 안내 (최종 확정 아님)${title ? ` - ${title}` : ""}`,
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

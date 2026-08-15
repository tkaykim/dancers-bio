import { consultationCandidatesFromAnswers } from "@/lib/visa/consultation-slots";

/**
 * 비자 케이스의 "지금 어느 단계인가"를 실제 이벤트(초대·후보 일정·오디션 결과)로 계산한다.
 * 수기 `status`는 미팅을 확정해도 `reviewing`에 머물러 목록에서 전부 같은 뱃지로 보였다.
 * 표시 전용 파생값이며 DB를 쓰지 않는다 — 서버에서 한 번 계산해 목록으로 내려보낸다.
 */

export const VISA_STATUS_OPTIONS: { v: string; l: string }[] = [
  { v: "new", l: "신규" },
  { v: "reviewing", l: "검토중" },
  { v: "education", l: "교육중" },
  { v: "documents", l: "서류준비" },
  { v: "submitted", l: "신청접수" },
  { v: "approved", l: "발급완료" },
  { v: "on_hold", l: "보류" },
  { v: "rejected", l: "반려" },
];

export const VISA_CASE_STAGE_LABEL: Record<string, string> = {
  application_received: "지원서 접수",
  triage_submitted: "추가정보 검토",
  audition_scheduled: "오디션 예정",
  audition_complete: "오디션 완료",
  training: "전문 트레이닝",
  monthly_evaluation: "월말평가",
  visa_documents: "비자 서류 준비",
  visa_submitted: "비자 신청 접수",
  complete: "완료",
  on_hold: "보류",
};

export const VISA_DECLINE_REASON: Record<string, string> = {
  other_agency: "다른 에이전시·경로",
  price: "비용 부담",
  schedule: "일정 불가",
  not_ready: "결정 보류",
  other: "기타",
};

/** 질문지 제출을 기대하는 메일만 무응답 기준 시각으로 쓴다 (미팅 안내는 이미 그 다음 단계다). */
const RESPONSE_EXPECTING_MAIL_KINDS = new Set([
  "application_confirmation",
  "followup",
  "revive",
  "reschedule",
]);

/** 내부·테스트 신청 판별. memo 프리픽스가 1차, 내부 주소가 2차 근거다. */
const INTERNAL_EMAIL_PATTERNS = [
  "@astcompany.co.kr",
  "@grigoent.co.kr",
  "dancers.bio.kr+",
  "tommy062166@gmail.com",
];

export const NO_RESPONSE_THRESHOLD_DAYS = 7;

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type VisaCaseQueue = "schedule" | "verdict" | "no_response" | "meeting";

export type VisaCaseTone = "action" | "meeting" | "danger" | "neutral" | "muted";

export type VisaCaseDerived = {
  key: string;
  label: string;
  tone: VisaCaseTone;
  queue: VisaCaseQueue | null;
  /** 0=액션 필요, 1=미팅 예정, 2=진행 중, 3=종료, 4=대상 아님·테스트 */
  sortBucket: number;
  /** 버킷 0은 오래 기다린 순, 1은 임박한 순, 그 외는 최신 순으로 쓰는 기준 시각(ms). */
  sortTime: number;
  /** 이 케이스와 관련된 미팅 시각 — 예정 건은 다가오는 미팅, 끝난 건은 마지막 미팅. */
  meetingAt: string | null;
  badges: string[];
  manualStatusChip: string | null;
  isTest: boolean;
};

type InviteLike = {
  status: string;
  calendar_status: string;
  meeting_at: string;
  duration_minutes: number | null;
  created_at: string;
};

type MailLike = {
  kind: string;
  status: string;
  sent_at: string | null;
};

export type VisaCaseStateInput = {
  created_at: string;
  status: string;
  memo: string | null;
  email: string;
  declined_at: string | null;
  decline_reason: string | null;
  follow_up_submitted_at: string | null;
  follow_up_answers: Record<string, unknown>;
  audition_result: string;
  case_stage: string;
  is_korean_national: boolean | null;
  meeting_invites: InviteLike[];
  outbound_mails: MailLike[];
  tracking: { sentAt: string | null } | null;
};

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** "YYYY-MM-DDTHH:mm" (한국시간 벽시계) → epoch ms */
function kstLocalToMs(value: string): number | null {
  const parsed = new Date(`${value}:00+09:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function kstDayIndex(value: number): number {
  return Math.floor((value + KST_OFFSET_MS) / DAY_MS);
}

function formatKstMeeting(value: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

export function isInternalVisaApplication(input: Pick<VisaCaseStateInput, "memo" | "email">): boolean {
  if ((input.memo ?? "").trimStart().startsWith("[E2E TEST")) return true;
  const email = input.email.toLowerCase();
  return INTERNAL_EMAIL_PATTERNS.some((pattern) => email.includes(pattern));
}

/** 질문지를 언제부터 기다리고 있는지 — 마지막 응답 요청 발송 시각, 없으면 접수 시각. */
function waitingSince(input: VisaCaseStateInput): number {
  const candidates = [ms(input.created_at) ?? 0, ms(input.tracking?.sentAt ?? null) ?? 0];
  for (const mail of input.outbound_mails) {
    if (mail.status !== "sent") continue;
    if (!RESPONSE_EXPECTING_MAIL_KINDS.has(mail.kind)) continue;
    candidates.push(ms(mail.sent_at) ?? 0);
  }
  return Math.max(...candidates);
}

function inviteEnd(invite: InviteLike): number | null {
  const start = ms(invite.meeting_at);
  if (start == null) return null;
  return start + (invite.duration_minutes || 30) * 60_000;
}

export function deriveVisaCaseState(
  input: VisaCaseStateInput,
  nowIso: string,
): VisaCaseDerived {
  const derived = deriveState(input, nowIso);
  // 테스트·내부 신청은 라벨은 그대로 두되 액션 큐 카운트를 오염시키지 않는다.
  return derived.isTest ? { ...derived, queue: null } : derived;
}

function deriveState(input: VisaCaseStateInput, nowIso: string): VisaCaseDerived {
  const now = ms(nowIso) ?? Date.now();
  const createdAt = ms(input.created_at) ?? now;
  const isTest = isInternalVisaApplication(input);
  const badges: string[] = [];
  if (isTest) badges.push("테스트·내부");

  const sentInvites = input.meeting_invites.filter((invite) => invite.status === "sent");
  const latestInvite = [...input.meeting_invites].sort(
    (a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0),
  )[0];
  const upcoming = sentInvites
    .map((invite) => ({ invite, start: ms(invite.meeting_at) ?? 0, end: inviteEnd(invite) ?? 0 }))
    .filter((item) => item.end > now)
    .sort((a, b) => a.start - b.start)[0];
  const finished = sentInvites
    .map((invite) => ({ invite, start: ms(invite.meeting_at) ?? 0, end: inviteEnd(invite) ?? 0 }))
    .filter((item) => item.end <= now)
    .sort((a, b) => b.end - a.end)[0];

  if (sentInvites.length > 0 && !input.follow_up_submitted_at) {
    badges.push("질문지 미제출");
  }

  const manualStatusChip = (() => {
    if (["education", "documents", "submitted", "approved"].includes(input.status)) {
      return `수기: ${VISA_STATUS_OPTIONS.find((s) => s.v === input.status)?.l ?? input.status}`;
    }
    if (input.status === "on_hold" && !input.declined_at && input.case_stage !== "on_hold") {
      return "수기: 보류";
    }
    return null;
  })();

  const base = {
    badges,
    manualStatusChip,
    isTest,
    meetingAt: upcoming?.invite.meeting_at ?? finished?.invite.meeting_at ?? null,
  };
  const bucketOf = (bucket: number) => (isTest ? 4 : bucket);

  // 1. 지원자가 스스로 중단
  if (input.declined_at) {
    const reason = input.decline_reason
      ? VISA_DECLINE_REASON[input.decline_reason] ?? input.decline_reason
      : "사유 미기재";
    return {
      ...base,
      key: "declined",
      label: `진행 안 함 · ${reason}`,
      tone: "muted",
      queue: null,
      sortBucket: bucketOf(3),
      sortTime: ms(input.declined_at) ?? createdAt,
    };
  }

  // 2. 대상 아님 (한국 국적은 /visa/apply에서도 차단되는 조건)
  if (input.status === "rejected" || input.is_korean_national === true) {
    return {
      ...base,
      key: "not_eligible",
      label: "대상 아님",
      tone: "muted",
      queue: null,
      sortBucket: 4,
      sortTime: createdAt,
    };
  }

  // 3. 확정 시도가 실패한 채로 남아 있음 (Calendar 실패와 메일 실패를 구분한다)
  if (latestInvite && latestInvite.status !== "sent") {
    const mailOnly = latestInvite.calendar_status === "created";
    return {
      ...base,
      key: mailOnly ? "mail_retry" : "calendar_retry",
      label: mailOnly ? "메일 재발송 필요" : "Calendar 재시도 필요",
      tone: "danger",
      queue: "schedule",
      sortBucket: bucketOf(0),
      sortTime: ms(latestInvite.created_at) ?? createdAt,
    };
  }

  // 4. 미팅 확정 — 목록에서 바로 일시를 읽을 수 있게 라벨에 박는다
  if (upcoming) {
    const started = upcoming.start <= now;
    const dDay = kstDayIndex(upcoming.start) - kstDayIndex(now);
    const when = formatKstMeeting(upcoming.start);
    const prefix = started
      ? "미팅 진행 중"
      : dDay <= 0
        ? "미팅 오늘"
        : `미팅 D-${dDay}`;
    if (finished && input.audition_result === "pending") {
      badges.push("이전 미팅 판정 미입력");
    }
    return {
      ...base,
      key: started ? "meeting_in_progress" : "meeting_upcoming",
      label: `${prefix} · ${when}`,
      tone: "meeting",
      queue: "meeting",
      sortBucket: bucketOf(1),
      sortTime: upcoming.start,
    };
  }

  // 5. 미팅은 끝났는데 판정이 안 들어옴
  if (finished && input.audition_result === "pending") {
    return {
      ...base,
      key: "meeting_done_pending",
      label: `미팅 완료 · 판정 입력 (${formatKstMeeting(finished.start)})`,
      tone: "action",
      queue: "verdict",
      sortBucket: bucketOf(0),
      sortTime: finished.end,
    };
  }

  // 6·7. 후보 일정은 냈는데 아직 확정을 안 함
  if (sentInvites.length === 0) {
    const candidates = consultationCandidatesFromAnswers(input.follow_up_answers).filter(
      (candidate) => candidate.sourceLocal,
    );
    // 질문지는 냈는데 후보 일정이 하나도 없으면 지원자 재제출을 기다리는 상태다.
    // (지난 후보를 비우고 재요청한 경우가 여기 해당 — 큐에서 사라지면 잊힌다.)
    if (candidates.length === 0 && input.follow_up_submitted_at) {
      return {
        ...base,
        key: "slots_awaiting_applicant",
        label: "일정 재제출 대기",
        tone: "action",
        queue: "schedule",
        sortBucket: bucketOf(0),
        sortTime: ms(input.follow_up_submitted_at) ?? createdAt,
      };
    }
    if (candidates.length > 0) {
      const converted = candidates.map((candidate) =>
        candidate.kstLocal ? kstLocalToMs(candidate.kstLocal) : null,
      );
      // 시간대가 없어 KST 환산이 안 되는 후보가 있으면 만료로 단정하지 않는다.
      const allResolved = converted.every((value) => value != null);
      const allPast = allResolved && converted.every((value) => (value as number) <= now);
      return {
        ...base,
        key: allPast ? "slots_expired" : "slots_awaiting",
        label: allPast ? "후보 만료 · 재요청" : "일정 확정 필요",
        tone: "action",
        queue: "schedule",
        sortBucket: bucketOf(0),
        sortTime: ms(input.follow_up_submitted_at) ?? createdAt,
      };
    }
  }

  // 8·9. 질문지 자체가 안 들어옴
  if (!input.follow_up_submitted_at) {
    const since = waitingSince(input);
    const days = Math.max(0, Math.floor((now - since) / DAY_MS));
    if (days >= NO_RESPONSE_THRESHOLD_DAYS) {
      return {
        ...base,
        key: "no_response",
        label: `무응답 ${days}일`,
        tone: "action",
        queue: "no_response",
        sortBucket: bucketOf(0),
        sortTime: since,
      };
    }
    return {
      ...base,
      key: "new_intake",
      label: days > 0 ? `신규 접수 · ${days}일` : "신규 접수 · 오늘",
      tone: "neutral",
      queue: null,
      sortBucket: bucketOf(2),
      sortTime: createdAt,
    };
  }

  // 10. 그 밖에는 운영자가 입력한 케이스 단계를 그대로 쓴다
  return {
    ...base,
    key: `stage:${input.case_stage}`,
    label: VISA_CASE_STAGE_LABEL[input.case_stage] ?? input.case_stage,
    tone: "neutral",
    queue: null,
    sortBucket: bucketOf(2),
    sortTime: createdAt,
  };
}

/** 액션 필요 → 미팅 임박 → 최근 접수 순. 대상 아님·테스트는 항상 맨 아래. */
export function compareVisaCaseDerived(a: VisaCaseDerived, b: VisaCaseDerived): number {
  if (a.sortBucket !== b.sortBucket) return a.sortBucket - b.sortBucket;
  if (a.sortBucket === 0 || a.sortBucket === 1) return a.sortTime - b.sortTime;
  return b.sortTime - a.sortTime;
}

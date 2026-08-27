// 출금 지급 주기 정본 — 매주 금요일(KST) 일괄 이체.
// 목요일까지 접수된 출금 신청은 그 주 금요일에, 금요일·주말 신청은
// 다음 주 금요일에 지급하는 것으로 댄서에게 안내한다.
// 이 규칙을 바꾸면 댄서 화면(/me/settlements, /w)과 관리자 화면
// (/admin/settlements)의 안내 문구·예정일 계산이 함께 바뀐다.

export const PAYOUT_RULE_LINE = "출금 신청분은 매주 금요일에 일괄 입금돼요.";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

// KST는 서머타임이 없는 고정 UTC+9라, 시각에 9시간을 더한 뒤 UTC 달력을
// 읽으면 Asia/Seoul 기준의 연·월·일·요일이 된다. 반환값은 그 달력 날짜를
// UTC 자정으로 고정한 Date(날짜 연산 전용, 시각 의미 없음).
function kstCalendarDate(at: Date): Date {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

// 신청 시점 기준의 지급 예정일(다가오는 금요일). 금요일 당일 신청은
// 배치 마감(목요일) 이후라 다음 주 금요일로 잡는다.
export function nextPayoutDate(at: Date = new Date()): Date {
  const day = kstCalendarDate(at);
  const dow = day.getUTCDay();
  const daysAhead = dow <= 4 ? 5 - dow : 12 - dow;
  return new Date(day.getTime() + daysAhead * DAY_MS);
}

// 특정 신청 건의 안내용 예정일. 원래 예정일이 이미 지났는데도 미지급이면
// (구 경로 잔여 건 등) 다가오는 지급일로 다시 안내한다 — 과거 날짜를
// "입금 예정"으로 보여주는 것이 가장 나쁜 안내이기 때문.
export function expectedPayoutDate(
  requestedAt: Date,
  now: Date = new Date(),
): Date {
  const scheduled = nextPayoutDate(requestedAt);
  const today = kstCalendarDate(now);
  if (scheduled.getTime() >= today.getTime()) return scheduled;
  // 오늘이 금요일이면 오늘 배치 대상, 아니면 다음 금요일.
  if (today.getUTCDay() === 5) return today;
  return nextPayoutDate(now);
}

// "9/5(금)" 형태. 오늘이면 "오늘(금)".
export function formatPayoutDate(date: Date, now: Date = new Date()): string {
  const today = kstCalendarDate(now);
  const weekday = WEEKDAY_KO[date.getUTCDay()];
  if (date.getTime() === today.getTime()) return `오늘(${weekday})`;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${weekday})`;
}

export function nextPayoutLabel(now: Date = new Date()): string {
  return formatPayoutDate(nextPayoutDate(now), now);
}

export function expectedPayoutLabel(
  requestedAt: string | Date,
  now: Date = new Date(),
): string {
  const at =
    typeof requestedAt === "string" ? new Date(requestedAt) : requestedAt;
  if (Number.isNaN(at.getTime())) return nextPayoutLabel(now);
  return formatPayoutDate(expectedPayoutDate(at, now), now);
}

// ISO 시각의 KST 기준 연도 (연도별 합계 버킷용 — 서버가 UTC라도 안전).
export function kstYear(iso: string): number {
  return kstCalendarDate(new Date(iso)).getUTCFullYear();
}

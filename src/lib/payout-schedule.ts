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

// ISO 시각의 KST 기준 월 키 ("2026-08") — 월별 소계 버킷용.
// kstYear와 같은 규칙(고정 UTC+9 이동 후 UTC 달력 읽기)이라 서버가 UTC여도
// 8/1 00:30 KST 입금이 7월로 밀리지 않는다.
export function kstMonthKey(iso: string | Date): string {
  const day = kstCalendarDate(typeof iso === "string" ? new Date(iso) : iso);
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  return `${day.getUTCFullYear()}-${mm}`;
}

// "2026-08" → "2026년 8월".
export function kstMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  return `${y}년 ${Number(m)}월`;
}

// 월 그룹 안에서 쓰는 날짜 표기 — "18일 (화)". 연·월은 그룹 헤더가 말한다.
export function kstDayLabel(iso: string | Date): string {
  const day = kstCalendarDate(typeof iso === "string" ? new Date(iso) : iso);
  return `${day.getUTCDate()}일 (${WEEKDAY_KO[day.getUTCDay()]})`;
}

// 오늘(KST)의 연·월·일. 기간 필터 경계를 만들 때 쓴다.
export function kstTodayParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const day = kstCalendarDate(now);
  return {
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
  };
}

// ── 기간 필터 (댄서 정산 내역 /me/settlements/history) ────────────────
// 관리자 지급 장부(/admin/settlements/ledger)와 같은 탭 구성이지만,
// 지난 연도도 골라야 해서 year에 상한을 두고 custom은 끝날을 하루 통째로
// 포함하도록 상한을 배타(toExclusive)로 돌려준다. `2026-12-31T23:59:59`를
// 상한으로 쓰면 그날 23:59:59.5 입금이 빠지기 때문.

export type PayoutPeriod = "month" | "year" | "all" | "custom";

const PAYOUT_PERIODS: readonly PayoutPeriod[] = ["month", "year", "all", "custom"];
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePayoutPeriod(
  raw: string | null | undefined,
  fallback: PayoutPeriod = "year",
): PayoutPeriod {
  return PAYOUT_PERIODS.includes(raw as PayoutPeriod)
    ? (raw as PayoutPeriod)
    : fallback;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 형식만 맞고 달력에 없는 날짜(2026-13-99, 2026-02-30)를 걸러낸다.
// 형식만 보면 Date가 알아서 넘겨버려서(2026-13-99 → 2027년 어딘가) 화면은
// "~ 2026-13-99"라고 써놓고 실제로는 상한 없이 전부 보여주게 된다.
function isRealDateOnly(date: string | null | undefined): date is string {
  if (!date || !DATE_ONLY_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

// "2026-08-31" → "2026-09-01" (KST 달력 기준 다음 날).
function nextDateOnly(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

/**
 * 기간 → paid_at 필터 경계 (KST). from은 포함, toExclusive는 배타.
 * 쿼리에서는 `.gte(from)` + `.lt(toExclusive)`로 쓴다.
 */
export function kstPeriodRange(
  period: PayoutPeriod,
  opts: {
    year?: number | null;
    from?: string | null;
    to?: string | null;
    now?: Date;
  } = {},
): { from: string | null; toExclusive: string | null } {
  const now = opts.now ?? new Date();
  if (period === "all") return { from: null, toExclusive: null };

  if (period === "custom") {
    const from = isRealDateOnly(opts.from) ? opts.from : null;
    const to = isRealDateOnly(opts.to) ? opts.to : null;
    return {
      from: from ? `${from}T00:00:00+09:00` : null,
      toExclusive: to ? `${nextDateOnly(to)}T00:00:00+09:00` : null,
    };
  }

  const today = kstTodayParts(now);
  if (period === "year") {
    const y = opts.year ?? today.year;
    return {
      from: `${y}-01-01T00:00:00+09:00`,
      toExclusive: `${y + 1}-01-01T00:00:00+09:00`,
    };
  }

  // 이번 달
  const nextMonth = today.month === 12 ? 1 : today.month + 1;
  const nextMonthYear = today.month === 12 ? today.year + 1 : today.year;
  return {
    from: `${today.year}-${pad2(today.month)}-01T00:00:00+09:00`,
    toExclusive: `${nextMonthYear}-${pad2(nextMonth)}-01T00:00:00+09:00`,
  };
}

export function payoutPeriodLabel(
  period: PayoutPeriod,
  opts: {
    year?: number | null;
    from?: string | null;
    to?: string | null;
    now?: Date;
  } = {},
): string {
  if (period === "all") return "전체";
  if (period === "month") return "이번 달";
  if (period === "year") {
    return `${opts.year ?? kstTodayParts(opts.now ?? new Date()).year}년`;
  }
  const from = isRealDateOnly(opts.from) ? opts.from : null;
  const to = isRealDateOnly(opts.to) ? opts.to : null;
  // 날짜를 아직 안 고른 '직접 선택'은 실제로 아무것도 안 거른 전체 조회다.
  // "직접 선택 받은 금액"이라고 쓰면 걸러진 결과처럼 읽힌다.
  if (!from && !to) return "전체";
  return `${from ?? "처음"} ~ ${to ?? "오늘"}`;
}

// ── 월별 집계 ────────────────────────────────────────────────────────
// 정산 내역은 원천이 둘(구 경로 정산 · 잔액 출금)이라 합친 뒤에 버킷을
// 나눈다. 그래서 집계 함수는 두 원천이 공통으로 가진 (입금일, 금액)만 본다.

export type KstMonthGroup<T> = {
  key: string; // "2026-08"
  label: string; // "2026년 8월"
  total: number;
  count: number;
  rows: T[];
};

type DatedAmount = { paidAt: string; amount: number };

function validDate(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

/** 입금일(KST) 기준 월별 그룹. 최신 월이 앞, 월 안에서도 최신 건이 앞. */
export function groupByKstMonth<T extends DatedAmount>(
  rows: T[],
): KstMonthGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    if (!validDate(row.paidAt)) continue;
    const key = kstMonthKey(row.paidAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, bucket]) => {
      const sorted = [...bucket].sort(
        (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
      );
      return {
        key,
        label: kstMonthLabel(key),
        count: sorted.length,
        total: sorted.reduce((sum, r) => sum + r.amount, 0),
        rows: sorted,
      };
    });
}

/** 입금일(KST) 기준 연도별 합계 — 요약 카드의 '받은 정산'과 같은 버킷. */
export function sumByKstYear<T extends DatedAmount>(
  rows: T[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const row of rows) {
    if (!validDate(row.paidAt)) continue;
    const year = kstYear(row.paidAt);
    out[year] = (out[year] ?? 0) + row.amount;
  }
  return out;
}

/** 기간 경계(KST) 안의 행만 남긴다. from은 포함, toExclusive는 배타. */
export function filterByKstPeriod<T extends DatedAmount>(
  rows: T[],
  range: { from: string | null; toExclusive: string | null },
): T[] {
  const fromMs = range.from ? new Date(range.from).getTime() : null;
  const toMs = range.toExclusive ? new Date(range.toExclusive).getTime() : null;
  return rows.filter((row) => {
    const t = new Date(row.paidAt).getTime();
    if (Number.isNaN(t)) return false;
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t >= toMs) return false;
    return true;
  });
}

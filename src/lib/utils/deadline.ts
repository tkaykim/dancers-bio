/**
 * 지원 마감일 D-day 계산 유틸 (Asia/Seoul 달력일 기준).
 *
 * 기존엔 각 화면이 `Math.max(0, ceil((deadline - now)/일))` 를 따로 구현했는데,
 * `Math.max(0, …)` 가 과거 마감일을 0 으로 깎아버려 "지난 마감일이 영원히 '오늘'
 * 로 표시되는" 버그가 있었다. 여기서 단일 구현으로 통합하고, 과거는 음수로 둔다.
 *
 * 또한 raw 밀리초 차이를 ceil 하면 같은 날 오후 마감(오늘 18:00)을 오전(10:00)에
 * 보면 0.33일 → ceil → 1 ("D-1") 로 잘못 나오므로, 양쪽을 KST 자정 달력일로
 * 환산해 정수 일수 차이를 구한다.
 */

const KST = "Asia/Seoul";

/** 해당 시각을 KST 달력일의 UTC 자정 밀리초로 환산. */
function kstCalendarDayUtc(date: Date): number {
  // en-CA 로케일은 항상 YYYY-MM-DD 형식
  const ymd = date.toLocaleDateString("en-CA", { timeZone: KST });
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * 마감일까지 남은 달력 일수 (KST 기준).
 * - `null` → null (상시 모집, 마감 없음 / 잘못된 값)
 * - 양수 → 남은 일수 (내일 마감이면 1)
 * - 0 → 오늘 마감
 * - 음수 → 마감 지남 (어제가 마감이었으면 -1)
 */
export function daysUntilDeadline(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const deadlineDay = kstCalendarDayUtc(d);
  const todayDay = kstCalendarDayUtc(new Date());
  return Math.round((deadlineDay - todayDay) / 86_400_000);
}

/**
 * 마감일이 지났는지 (KST 달력일 기준).
 * - 마감일 없음(null/상시) → false (지원 가능, 계속 노출)
 * - 오늘 마감 → false (오늘 자정까지는 유효)
 * - 어제 이전 → true
 */
export function isDeadlinePassed(iso: string | null | undefined): boolean {
  const d = daysUntilDeadline(iso);
  return d !== null && d < 0;
}

export type DeadlineLabels = {
  /** 마감일 없음 (상시). 기본값 "—" */
  none?: string;
  /** 오늘 마감. 기본값 "오늘" */
  today?: string;
  /** 마감 지남. 기본값 "마감" */
  past?: string;
  /** D-n 포맷 함수. 기본값 (n) => `D-${n}` */
  future?: (days: number) => string;
};

/**
 * D-day 배지 라벨 문자열.
 * 화면별로 표기가 조금씩 달라서(예: "오늘"/"오늘 마감"/"TODAY") 라벨을 주입받는다.
 */
export function deadlineLabel(
  iso: string | null | undefined,
  labels: DeadlineLabels = {},
): string {
  const d = daysUntilDeadline(iso);
  if (d === null) return labels.none ?? "—";
  if (d < 0) return labels.past ?? "마감";
  if (d === 0) return labels.today ?? "오늘";
  return (labels.future ?? ((n) => `D-${n}`))(d);
}

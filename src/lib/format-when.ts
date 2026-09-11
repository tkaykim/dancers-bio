import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

/* eslint-disable no-restricted-syntax -- 언어별 표기 데이터(ko 분기)를 한 파일에서 관리한다 */
const WDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
const WDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TBD_SCHEDULE: Record<Locale, string> = { ko: "일정 미정", en: "Schedule TBD", ja: "日程未定" };
const TBD_TIME: Record<Locale, string> = { ko: "시간 미정", en: "Time TBD", ja: "時間未定" };

// ISO → "6월 18일(수) 16:00~21:00" (KST). ends 없으면 시작만.
// timeTbd=true 면 시간 미정 — 날짜만 "6월 18일(수) · 시간 미정".
// locale 은 마지막 선택 인자다(기본 ko — 기존 호출처 무변경, docs/design-i18n-ui.md §3.7).
//   en: "Jun 18 (Wed) 16:00–21:00" · ja: "6月18日(水) 16:00〜21:00"
export function formatWhen(
  startsAt: string | null,
  endsAt: string | null,
  timeTbd = false,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!startsAt) return TBD_SCHEDULE[locale];
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return TBD_SCHEDULE[locale];
  const kst = new Date(s.getTime() + 9 * 3600 * 1000);
  const mo = kst.getUTCMonth() + 1;
  const da = kst.getUTCDate();
  const dow = kst.getUTCDay();
  const date =
    locale === "en"
      ? `${MONTH_EN[mo - 1]} ${da} (${WDAY_EN[dow]})`
      : locale === "ja"
        ? `${mo}月${da}日(${WDAY_JA[dow]})`
        : `${mo}월 ${da}일(${WDAY_KO[dow]})`;
  if (timeTbd) return `${date} · ${TBD_TIME[locale]}`;
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  let out = `${date} ${hh}:${mm}`;
  if (endsAt) {
    const e = new Date(endsAt);
    if (!Number.isNaN(e.getTime())) {
      const ek = new Date(e.getTime() + 9 * 3600 * 1000);
      const sep = locale === "en" ? "–" : locale === "ja" ? "〜" : "~";
      out += `${sep}${String(ek.getUTCHours()).padStart(2, "0")}:${String(ek.getUTCMinutes()).padStart(2, "0")}`;
    }
  }
  return out;
}

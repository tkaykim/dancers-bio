const WDAY = ["일", "월", "화", "수", "목", "금", "토"];

// ISO → "6월 18일(수) 16:00~21:00" (KST). ends 없으면 시작만.
export function formatWhen(
  startsAt: string | null,
  endsAt: string | null,
): string {
  if (!startsAt) return "일정 미정";
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return "일정 미정";
  const kst = new Date(s.getTime() + 9 * 3600 * 1000);
  const mo = kst.getUTCMonth() + 1;
  const da = kst.getUTCDate();
  const wd = WDAY[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  let out = `${mo}월 ${da}일(${wd}) ${hh}:${mm}`;
  if (endsAt) {
    const e = new Date(endsAt);
    if (!Number.isNaN(e.getTime())) {
      const ek = new Date(e.getTime() + 9 * 3600 * 1000);
      out += `~${String(ek.getUTCHours()).padStart(2, "0")}:${String(ek.getUTCMinutes()).padStart(2, "0")}`;
    }
  }
  return out;
}

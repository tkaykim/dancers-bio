export function compactFollowers(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return "확인 중";
  if (value >= 10000) return `${Math.round(value / 1000) / 10}만`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}천`;
  return value.toLocaleString("ko-KR");
}

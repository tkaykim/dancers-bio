/** Keep SSR and browser text identical even when the host timezone differs. */
export function formatIntakeDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/feed",
): string {
  if (!raw) return fallback;
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

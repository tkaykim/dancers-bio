export function normalizeInstagramHandle(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com(?:\/|$)/.test(value)) {
    value = value.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/?/, "");
  } else if (value.includes("://")) return null;
  value = value.replace(/^@/, "").split(/[?/]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(value) ? value : null;
}
export function parseReelUrl(input: string): {
  shortCode: string;
  url: string;
} | null {
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
    if (
      !["instagram.com", "www.instagram.com"].includes(
        parsed.hostname.toLowerCase(),
      ) ||
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      return null;
    const match = parsed.pathname.match(
      /^\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)\/?$/,
    );
    return match
      ? {
          shortCode: match[1],
          url: `https://www.instagram.com/reel/${match[1]}/`,
        }
      : null;
  } catch {
    return null;
  }
}
export const normalizeReelUrl = (input: string): string | null =>
  parseReelUrl(input)?.url ?? null;

export type SocialPlatform = "instagram" | "youtube" | "tiktok";

/**
 * Extract the user-visible handle from any stored social value
 * (full URL or raw handle, with or without leading @).
 */
export function extractSocialHandle(raw: string | null | undefined): string {
  if (!raw) return "";
  const v = raw.trim();
  if (!v) return "";
  // If URL, take the last meaningful path segment
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const segs = u.pathname.split("/").filter(Boolean);
      // youtube /@channel or /channel/UC...
      if (segs[0] === "channel" && segs[1]) return `channel/${segs[1]}`;
      const last = segs[segs.length - 1] ?? "";
      return last.replace(/^@/, "");
    } catch {
      return v.replace(/^@/, "");
    }
  }
  return v.replace(/^@/, "");
}

/**
 * Normalize user input (URL or handle) into a canonical full URL for storage.
 * Returns null when input is empty so we can skip writing.
 */
export function buildSocialUrl(
  platform: SocialPlatform,
  raw: string | null | undefined,
): string | null {
  const handle = extractSocialHandle(raw);
  if (!handle) return null;
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "youtube":
      return handle.startsWith("channel/")
        ? `https://www.youtube.com/${handle}`
        : `https://www.youtube.com/@${handle}`;
  }
}

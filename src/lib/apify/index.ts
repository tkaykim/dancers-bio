import "server-only";

// TODO: wire real Apify actors. APIFY_TOKEN / APIFY_IG_ACTOR env.
// Currently stubbed when unconfigured. The action layer treats a stubbed
// failure the same as any other scrape failure (queue → 'failed').

const DEFAULT_IG_ACTOR = "apify~instagram-profile-scraper";

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function actorId(): string {
  return process.env.APIFY_IG_ACTOR ?? DEFAULT_IG_ACTOR;
}

/**
 * Scrape a single IG profile via Apify run-sync. Returns the first dataset item
 * as the raw scrape object. Stubbed (ok:false) when APIFY_TOKEN is unset.
 */
export async function scrapeIgProfile(
  igHandleOrUserId: string,
): Promise<
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; error: string }
> {
  if (!apifyConfigured()) {
    return {
      ok: false,
      error: "APIFY_TOKEN 미설정 — 스크랩 스텁. 키 설정 후 실제 크롤.",
    };
  }

  const handle = (igHandleOrUserId ?? "").toString().trim().replace(/^@/, "");
  if (!handle) {
    return { ok: false, error: "스크랩 대상 핸들이 비어 있습니다." };
  }

  try {
    const token = process.env.APIFY_TOKEN!;
    const url = `https://api.apify.com/v2/acts/${actorId()}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [handle] }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Apify ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const items = (await res.json()) as unknown;
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: "Apify 결과가 비어 있습니다." };
    }
    const first = items[0];
    if (!first || typeof first !== "object") {
      return { ok: false, error: "Apify 결과 형식이 올바르지 않습니다." };
    }
    return { ok: true, raw: first as Record<string, unknown> };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

/**
 * Discover candidate accounts from a seed account's follow graph. Stubbed (empty)
 * when unconfigured. Real wiring pending an Apify follow-graph actor.
 */
export async function discoverFollowGraph(
  seedHandle: string,
  limit: number,
): Promise<
  Array<{
    ig_user_id: string;
    ig_handle: string;
    display_name?: string;
    follower_count?: number;
    bio_text?: string;
  }>
> {
  if (!apifyConfigured()) {
    console.warn(
      "[apify] discoverFollowGraph stub — APIFY_TOKEN 미설정. TODO: wire follow-graph actor.",
    );
    return [];
  }

  const handle = (seedHandle ?? "").toString().trim().replace(/^@/, "");
  if (!handle) return [];

  try {
    const token = process.env.APIFY_TOKEN!;
    const url = `https://api.apify.com/v2/acts/${actorId()}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedHandle: handle, limit }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[apify] discoverFollowGraph ${res.status}`);
      return [];
    }
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) return [];
    const out: Array<{
      ig_user_id: string;
      ig_handle: string;
      display_name?: string;
      follower_count?: number;
      bio_text?: string;
    }> = [];
    for (const it of items.slice(0, Math.max(0, limit))) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const ig_user_id =
        (typeof o.id === "string" && o.id) ||
        (typeof o.userId === "string" && o.userId) ||
        (typeof o.username === "string" && o.username) ||
        "";
      const ig_handle =
        (typeof o.username === "string" && o.username) ||
        (typeof o.userName === "string" && o.userName) ||
        "";
      if (!ig_user_id || !ig_handle) continue;
      out.push({
        ig_user_id,
        ig_handle,
        display_name:
          typeof o.fullName === "string" ? o.fullName : undefined,
        follower_count:
          typeof o.followersCount === "number" ? o.followersCount : undefined,
        bio_text: typeof o.biography === "string" ? o.biography : undefined,
      });
    }
    return out;
  } catch (err) {
    console.warn(
      "[apify] discoverFollowGraph error:",
      (err as Error).message ?? String(err),
    );
    return [];
  }
}

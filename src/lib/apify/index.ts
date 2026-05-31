import "server-only";

import { ApifyClient } from "apify-client";

// Apify로 IG 데이터 수집. 검증된 구현(orchestrator-integrations/apify-instagram.ts) 기반.
// 사용 actor:
//   - apify/instagram-profile-scraper  → 프로필(팔로워·바이오·최근 게시물)  input { usernames: [...] }
//   - apify/instagram-post-scraper     → 게시물(캡션·타임스탬프)            input { username: [...], resultsLimit }
//   - apify/instagram-hashtag-scraper  → 해시태그 인기 게시물(발견용)        input { hashtags: [...], resultsLimit }
// 환경변수: APIFY_TOKEN (사업부 무관 공통 1개). 미설정 시 모든 호출이 ok:false/[] 로 graceful.
// ⚠ 본인 계정엔 사용 금지(정지 리스크). 타 계정 리서치 전용.

let _client: ApifyClient | null = null;

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function client(): ApifyClient {
  if (_client) return _client;
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 환경변수가 필요합니다.");
  _client = new ApifyClient({ token });
  return _client;
}

type IgPost = {
  id?: string;
  shortCode?: string;
  url?: string;
  type?: string;
  caption?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
};

/**
 * IG 프로필 1건 정밀 스크랩(프로필 + 최근 게시물). 반환 raw는
 * extractDancerProfileFromScrape가 읽는 형태({ ...profile, latestPosts: [...] }).
 * APIFY_TOKEN 미설정/실패 시 ok:false.
 */
export async function scrapeIgProfile(
  igHandleOrUserId: string,
  opts?: { postsLimit?: number },
): Promise<
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; error: string }
> {
  if (!apifyConfigured()) {
    return { ok: false, error: "APIFY_TOKEN 미설정 — 스크랩 불가. 키 설정 후 재시도." };
  }
  const handle = (igHandleOrUserId ?? "").toString().trim().replace(/^@/, "");
  if (!handle) return { ok: false, error: "스크랩 대상 핸들이 비어 있습니다." };

  try {
    const c = client();
    // 1) 프로필
    const profRun = await c.actor("apify/instagram-profile-scraper").call({
      usernames: [handle],
    });
    const { items: profItems } = await c
      .dataset(profRun.defaultDatasetId)
      .listItems();
    const profile = (profItems?.[0] as Record<string, unknown>) ?? null;
    if (!profile) {
      return { ok: false, error: "Apify 프로필 결과가 비어 있습니다." };
    }

    // 2) 최근 게시물 — 프로필에 latestPosts가 없으면 별도 수집
    let latestPosts = Array.isArray(profile.latestPosts)
      ? (profile.latestPosts as IgPost[])
      : [];
    if (latestPosts.length === 0) {
      try {
        const postRun = await c.actor("apify/instagram-post-scraper").call({
          username: [handle],
          resultsLimit: opts?.postsLimit ?? 12,
        });
        const { items: postItems } = await c
          .dataset(postRun.defaultDatasetId)
          .listItems();
        latestPosts = (postItems as IgPost[]).map((p) => ({
          id: p.id ?? p.shortCode,
          url: p.url,
          type: p.type,
          caption: p.caption,
          timestamp: p.timestamp,
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
        }));
      } catch (e) {
        console.warn("[apify] post-scraper 실패(프로필은 유지):", (e as Error).message);
      }
    }

    return { ok: true, raw: { ...profile, latestPosts } };
  } catch (err) {
    return { ok: false, error: ((err as Error).message ?? String(err)).slice(0, 500) };
  }
}

/**
 * 해시태그 기반 댄서 후보 발견. 해시태그 인기 게시물의 작성자(ownerUsername)를 후보로 수집.
 * 팔로우그래프보다 싸고(검증된 hashtag-scraper) 댄스 해시태그로 신규 댄서를 넓게 긁는다.
 * APIFY_TOKEN 미설정 시 빈 배열.
 */
export async function discoverViaHashtag(
  hashtag: string,
  limit: number,
): Promise<
  Array<{
    ig_user_id: string;
    ig_handle: string;
    display_name?: string;
    follower_count?: number;
    bio_text?: string;
    source: string;
  }>
> {
  if (!apifyConfigured()) {
    console.warn("[apify] discoverViaHashtag — APIFY_TOKEN 미설정, 빈 결과.");
    return [];
  }
  const tag = (hashtag ?? "").toString().trim().replace(/^#/, "");
  if (!tag) return [];

  try {
    const c = client();
    const run = await c.actor("apify/instagram-hashtag-scraper").call({
      hashtags: [tag],
      resultsLimit: Math.max(1, Math.min(limit, 200)),
    });
    const { items } = await c.dataset(run.defaultDatasetId).listItems();

    const seen = new Set<string>();
    const out: Array<{
      ig_user_id: string;
      ig_handle: string;
      display_name?: string;
      follower_count?: number;
      bio_text?: string;
      source: string;
    }> = [];
    for (const it of (items as Array<Record<string, unknown>>) ?? []) {
      const owner =
        (typeof it.ownerUsername === "string" && it.ownerUsername) ||
        (typeof it.ownerUserName === "string" && it.ownerUserName) ||
        "";
      if (!owner || seen.has(owner)) continue;
      seen.add(owner);
      // 해시태그 게시물은 작성자 핸들만 신뢰 가능 → 핸들을 dedup 키(ig_user_id)로 사용.
      // 팔로워·bio는 이후 정밀 스크랩 단계에서 채워진다.
      out.push({
        ig_user_id: owner,
        ig_handle: owner,
        display_name: undefined,
        source: `hashtag:${tag}`,
      });
    }
    return out;
  } catch (err) {
    console.warn("[apify] discoverViaHashtag error:", (err as Error).message ?? String(err));
    return [];
  }
}

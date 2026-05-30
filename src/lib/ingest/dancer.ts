// TODO: replace heuristic extraction with LLM (src/lib/llm) once dancer-extraction
// prompt/schema added. Careers are UNVERIFIED.
//
// Pure, deterministic, dependency-free module. NOT a server action.
// Two responsibilities:
//   1. classifyDancerCandidate — cheap heuristic "is this account a dancer?" signal
//      used by the discovery webhook to filter the follow-graph firehose.
//   2. extractDancerProfileFromScrape — heuristic mapper from an Apify-style IG
//      scrape object into our dancers/careers shape. Careers are best-effort and
//      always flagged unverified until an LLM/human verifies them.

/** Korean + English dance vocabulary used for keyword detection + genre derivation. */
const DANCE_KEYWORDS: string[] = [
  "댄서",
  "안무",
  "비보이",
  "비걸",
  "팝핀",
  "락킹",
  "왁킹",
  "힙합",
  "코레오",
  "크루",
  "댄스",
  "choreographer",
  "choreo",
  "dancer",
  "crew",
  "dance",
];

/**
 * Genre keyword → canonical genre label. Order independent; first match wins per
 * canonical label. Scans bio text (lowercased) for each trigger.
 */
const GENRE_KEYWORDS: Array<{ triggers: string[]; genre: string }> = [
  { triggers: ["팝핀", "popping", "poppin"], genre: "popping" },
  { triggers: ["락킹", "locking", "lockin"], genre: "locking" },
  { triggers: ["왁킹", "waacking", "waack"], genre: "waacking" },
  { triggers: ["힙합", "hiphop", "hip hop", "hip-hop"], genre: "hiphop" },
  { triggers: ["하우스", "house"], genre: "house" },
  { triggers: ["크럼프", "krump"], genre: "krump" },
  { triggers: ["브레이킹", "비보이", "비걸", "bboy", "bgirl", "breaking", "breakin"], genre: "breaking" },
  { triggers: ["걸스힙합", "girls hiphop", "걸리시", "girlish"], genre: "girls_hiphop" },
  { triggers: ["코레오", "choreography", "choreo"], genre: "choreography" },
  { triggers: ["보깅", "voguing", "vogue"], genre: "voguing" },
  { triggers: ["jazz", "재즈"], genre: "jazz" },
  { triggers: ["k-pop", "kpop", "케이팝"], genre: "kpop" },
];

function norm(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase() : "";
}

/**
 * Heuristic classifier. follower-agnostic — pure text + graph signals so that
 * micro-accounts aren't unfairly downranked.
 */
export function classifyDancerCandidate(input: {
  bio_text?: string | null;
  ig_handle?: string | null;
  display_name?: string | null;
  mutuals_with_seed?: number;
}): { isDancer: boolean; bioKeywordHit: boolean; rankScore: number } {
  const haystack = [
    norm(input.bio_text),
    norm(input.ig_handle),
    norm(input.display_name),
  ].join(" ");

  const bioKeywordHit = DANCE_KEYWORDS.some((kw) =>
    haystack.includes(kw.toLowerCase()),
  );

  const mutuals = Math.max(
    0,
    Number.isFinite(input.mutuals_with_seed)
      ? Number(input.mutuals_with_seed)
      : 0,
  );

  // rankScore: bioKeywordHit(+40) + mutuals*5 capped at 30.
  const mutualsScore = Math.min(30, mutuals * 5);
  const rankScore = (bioKeywordHit ? 40 : 0) + mutualsScore;

  const isDancer = bioKeywordHit || mutuals >= 2;

  return { isDancer, bioKeywordHit, rankScore };
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function firstLine(s: string, max = 80): string {
  const line = s.split(/\r?\n/)[0]?.trim() ?? "";
  if (line.length <= max) return line;
  return line.slice(0, max).trimEnd();
}

/** Convert an arbitrary timestamp (ISO string / epoch sec / epoch ms) → yyyy-mm-dd. */
function toDateString(ts: unknown): string | null {
  if (ts == null) return null;
  let d: Date | null = null;
  if (typeof ts === "number") {
    // Heuristic: 10-digit = seconds, 13-digit = ms.
    d = new Date(ts < 1e12 ? ts * 1000 : ts);
  } else if (typeof ts === "string") {
    const t = ts.trim();
    if (!t) return null;
    const asNum = Number(t);
    if (Number.isFinite(asNum) && /^\d+$/.test(t)) {
      d = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
    } else {
      d = new Date(t);
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function deriveGenres(bio: string): string[] {
  const lower = bio.toLowerCase();
  const out: string[] = [];
  for (const { triggers, genre } of GENRE_KEYWORDS) {
    if (triggers.some((t) => lower.includes(t)) && !out.includes(genre)) {
      out.push(genre);
    }
  }
  return out;
}

/** Caption looks like a real activity (performance / choreo / workshop / battle). */
const ACTIVITY_HINTS: string[] = [
  "공연",
  "안무",
  "뮤비",
  "mv",
  "workshop",
  "워크샵",
  "워크숍",
  "클래스",
  "배틀",
  "대회",
  "performance",
  "perform",
  "choreo",
  "battle",
];

function classifyCareerType(caption: string): string {
  const lower = caption.toLowerCase();
  if (lower.includes("안무") || lower.includes("choreo")) return "choreo";
  if (
    lower.includes("workshop") ||
    lower.includes("워크샵") ||
    lower.includes("워크숍") ||
    lower.includes("클래스")
  ) {
    return "workshop";
  }
  return "performance";
}

interface ScrapePost {
  caption?: unknown;
  url?: unknown;
  timestamp?: unknown;
}

/**
 * Heuristic extractor from an Apify-style IG profile scrape object. Robust to
 * missing fields — every accessor is defensive.
 */
export function extractDancerProfileFromScrape(raw: Record<string, unknown>): {
  profile: {
    stage_name: string;
    bio: string | null;
    location: string | null;
    genres: string[];
    specialties: string[];
    profile_img: string | null;
    social_links: Record<string, string>;
  };
  careers: Array<{
    type: string;
    title: string;
    date: string | null;
    details: Record<string, unknown>;
  }>;
} {
  const username = asString(raw.username) ?? asString(raw.userName);
  const fullName = asString(raw.fullName) ?? asString(raw.full_name);
  const biography = asString(raw.biography) ?? asString(raw.bio);
  const profilePicUrl =
    asString(raw.profilePicUrl) ??
    asString(raw.profilePicUrlHD) ??
    asString(raw.profile_pic_url);

  const stage_name = fullName ?? username ?? "Unknown Dancer";

  const social_links: Record<string, string> = {};
  if (username) {
    social_links.instagram = `https://instagram.com/${username}`;
  }
  const externalUrl = asString(raw.externalUrl) ?? asString(raw.external_url);
  if (externalUrl) {
    social_links.website = externalUrl;
  }

  const bio = biography;
  const genres = bio ? deriveGenres(bio) : [];

  // Build careers[] from latestPosts that look like activities.
  const careers: Array<{
    type: string;
    title: string;
    date: string | null;
    details: Record<string, unknown>;
  }> = [];

  const posts = Array.isArray(raw.latestPosts)
    ? (raw.latestPosts as unknown[])
    : Array.isArray(raw.posts)
      ? (raw.posts as unknown[])
      : [];

  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    const post = p as ScrapePost;
    const caption = asString(post.caption);
    if (!caption) continue;
    const lower = caption.toLowerCase();
    const looksLikeActivity = ACTIVITY_HINTS.some((h) => lower.includes(h));
    if (!looksLikeActivity) continue;

    careers.push({
      type: classifyCareerType(caption),
      title: firstLine(caption, 80),
      date: toDateString(post.timestamp),
      details: {
        link: asString(post.url) ?? null,
        source: "ig_caption",
        unverified: true,
      },
    });
  }

  return {
    profile: {
      stage_name,
      bio,
      location: null,
      genres,
      specialties: [],
      profile_img: profilePicUrl,
      social_links,
    },
    careers,
  };
}

import "server-only";

import { getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEMAND_BANDS,
  PUBLIC_STATUSES,
  demandBandOf,
  parseDemandBand,
  type DemandBand,
  type WorkshopArtist,
  type WorkshopArtistPublic,
} from "@/lib/workshops/shared";

// 공개 조회는 anon 클라이언트 + RLS 로 읽는다.
// `workshop_artists_public_select` 정책이 published/recruiting/confirmed/completed 만 통과시키므로
// 코드에서 상태 필터를 빠뜨려도 비공개 제안(suggested)이 새지 않는다.
// demands·reservations 는 계속 잠겨 있고, 카드에 필요한 수요는 `workshop_public_counts()` RPC 가
// 구간(band)으로만 내보낸다 — 정확한 수요 수는 anon 경로 어디에도 싣지 않는다(D1).

const ARTIST_COLUMNS =
  "id, slug, name, instagram_handle, image_url, country, genres, headline, description, status, deposit_amount, total_price, min_headcount, max_headcount, expected_period, recruit_deadline, recruit_opened_at, confirmed_at, created_at";

type CountRow = { artist_id: string; demand_band: string; reserved_count: number };

async function loadCounts(): Promise<Map<string, { band: DemandBand; reserved: number }>> {
  const map = new Map<string, { band: DemandBand; reserved: number }>();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workshop_public_counts");
  if (error) {
    console.error("[workshops] counts rpc failed:", error);
    return map;
  }
  for (const row of (data ?? []) as CountRow[]) {
    map.set(row.artist_id, { band: parseDemandBand(row.demand_band), reserved: row.reserved_count ?? 0 });
  }
  return map;
}

function withCounts(
  artists: WorkshopArtist[],
  counts: Map<string, { band: DemandBand; reserved: number }>,
): WorkshopArtistPublic[] {
  return artists.map((a) => ({
    ...a,
    genres: a.genres ?? [],
    demand_band: counts.get(a.id)?.band ?? "lt10",
    reserved_count: counts.get(a.id)?.reserved ?? 0,
  }));
}

/** 공개 카드 목록 — 수요 구간 높은 순, 같은 구간이면 최신순 (구간 내 순위는 노출하지 않는다). */
export async function listPublicWorkshopArtists(): Promise<WorkshopArtistPublic[]> {
  const supabase = await createClient();
  // ⚠️ 관리자에게는 RLS 가 suggested·archived 까지 열어준다(관리자 정책).
  //    공개 화면은 관리자가 봐도 공개 카드만 보여야 하므로 코드 필터를 함께 건다.
  const { data, error } = await supabase
    .from("workshop_artists")
    .select(ARTIST_COLUMNS)
    .in("status", PUBLIC_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[workshops] list failed:", error);
    return [];
  }
  const counts = await loadCounts();
  const rows = withCounts((data ?? []) as WorkshopArtist[], counts);
  rows.sort(
    (a, b) =>
      DEMAND_BANDS.indexOf(b.demand_band) - DEMAND_BANDS.indexOf(a.demand_band) ||
      b.created_at.localeCompare(a.created_at),
  );
  return rows;
}

/** 상세 페이지용 단건 조회. RLS 가 비공개 카드를 걸러 404 로 이어진다. */
export async function getPublicWorkshopArtistBySlug(slug: string): Promise<WorkshopArtistPublic | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_artists")
    .select(ARTIST_COLUMNS)
    .eq("slug", slug)
    .in("status", PUBLIC_STATUSES)
    .maybeSingle();
  if (error || !data) return null;
  const counts = await loadCounts();
  return withCounts([data as WorkshopArtist], counts)[0] ?? null;
}

// ── '지금 요청되고 있는 안무가' (크라우드펀딩식 단일 그리드) ─────────────────
// 유저 요청(suggested — 실수요 1건 이상)과 운영 발행(published/confirmed/completed)을
// 한 리스트로 합치고 단계는 뱃지로만 구분한다. recruiting 은 별도 상단 섹션.
// suggested 는 RLS 가 anon 에게 숨기므로 서버에서 service-role 로 읽되,
// 카드 표시 정보만 내보낸다 — 제출자 연락처·정확한 수요 수는 절대 포함하지 않는다(D1).
// 정렬은 최신 수요 활동순 — 수요량 순으로 두면 수를 지워도 순위가 새어 나간다.
// 시드 카탈로그(수요 0)는 노출하지 않는다 — 아무도 원한 적 없는 이름이 사회적 증거처럼 보이면 안 된다.

export type RequestedArtist = {
  id: string;
  name: string;
  instagram_handle: string;
  genres: string[];
  country: string | null;
  headline: string | null;
  image_url: string | null;
  status: string;
  slug: string | null;
  demand_band: DemandBand;
};

export async function listRequestedArtists(limit = 60): Promise<RequestedArtist[]> {
  const admin = createAdminClient();
  const { data: artists } = await admin
    .from("workshop_artists")
    .select("id, name, instagram_handle, genres, country, headline, image_url, status, slug, created_at")
    .in("status", ["suggested", "published", "confirmed", "completed"])
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (artists ?? []) as Array<{
    id: string;
    name: string;
    instagram_handle: string;
    genres: string[] | null;
    country: string | null;
    headline: string | null;
    image_url: string | null;
    status: string;
    slug: string | null;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const { data: demands } = await admin.from("workshop_demands").select("artist_id, created_at");
  const counts = new Map<string, number>();
  const lastDemandAt = new Map<string, string>();
  for (const d of demands ?? []) {
    const id = d.artist_id as string;
    const at = d.created_at as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const prev = lastDemandAt.get(id);
    if (!prev || at > prev) lastDemandAt.set(id, at);
  }

  return rows
    .filter((r) => (r.status === "suggested" ? (counts.get(r.id) ?? 0) >= 1 : true))
    .sort((a, b) => {
      const la = lastDemandAt.get(a.id) ?? a.created_at;
      const lb = lastDemandAt.get(b.id) ?? b.created_at;
      return lb.localeCompare(la);
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      name: r.name,
      instagram_handle: r.instagram_handle,
      genres: r.genres ?? [],
      country: r.country,
      headline: r.headline,
      image_url: r.image_url,
      status: r.status,
      slug: r.slug,
      demand_band: demandBandOf(counts.get(r.id) ?? 0),
    }));
}

// ── 내 예약 ────────────────────────────────────────────────────────────────
// reservations 는 service-role 전용이라 여기서만 admin client 를 쓴다(항상 user_id 로 스코프).

export type MyReservation = {
  id: string;
  artist_id: string;
  order_no: string;
  amount: number;
  status: string;
  paid_at: string | null;
  receipt_url: string | null;
  expires_at: string | null;
  created_at: string;
};

/**
 * 로그인한 본인의 예약만 읽는다.
 * service-role 로 조회하므로 userId 를 인자로 받지 않고 세션에서 직접 확인한다
 * (호출자가 남의 UUID 를 넘길 여지를 없앤다).
 */
/**
 * 어떤 행을 보여줄지의 우선순위.
 * 최신순으로 1건만 뽑으면, 복구 대기(recovery_required) 건이 나중에 만든 pending 에 가려진다.
 * 돈이 걸린 상태를 항상 먼저 보여준다.
 */
const RESERVATION_PRIORITY = [
  "recovery_required",
  "confirmed",
  "paid",
  "transferred",
  "pending",
  "refunded",
];

export async function getMyWorkshopReservation(artistId: string): Promise<MyReservation | null> {
  const user = await getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_reservations")
    .select("id, artist_id, order_no, amount, status, paid_at, receipt_url, expires_at, created_at")
    .eq("user_id", user.id)
    .eq("artist_id", artistId)
    .in("status", RESERVATION_PRIORITY)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as MyReservation[];
  if (rows.length === 0) return null;
  rows.sort(
    (a, b) => RESERVATION_PRIORITY.indexOf(a.status) - RESERVATION_PRIORITY.indexOf(b.status),
  );
  return rows[0] ?? null;
}

export type MyReservationWithArtist = MyReservation & {
  artist_name: string;
  artist_slug: string | null;
  artist_status: string;
  expected_period: string | null;
  total_price: number | null;
};

/** `/me/workshops` — 로그인한 본인의 예약 전체. */
export async function listMyWorkshopReservations(): Promise<MyReservationWithArtist[]> {
  const user = await getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_reservations")
    .select(
      "id, artist_id, order_no, amount, status, paid_at, receipt_url, expires_at, created_at, workshop_artists(name, slug, status, expected_period, total_price)",
    )
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as unknown as (MyReservation & {
    workshop_artists: {
      name: string;
      slug: string | null;
      status: string;
      expected_period: string | null;
      total_price: number | null;
    } | null;
  })[]).map((r) => ({
    id: r.id,
    artist_id: r.artist_id,
    order_no: r.order_no,
    amount: r.amount,
    status: r.status,
    paid_at: r.paid_at,
    receipt_url: r.receipt_url,
    expires_at: r.expires_at,
    created_at: r.created_at,
    artist_name: r.workshop_artists?.name ?? "워크샵",
    artist_slug: r.workshop_artists?.slug ?? null,
    artist_status: r.workshop_artists?.status ?? "recruiting",
    expected_period: r.workshop_artists?.expected_period ?? null,
    total_price: r.workshop_artists?.total_price ?? null,
  }));
}

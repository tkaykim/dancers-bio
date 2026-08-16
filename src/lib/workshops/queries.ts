import "server-only";

import { getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_STATUSES, type WorkshopArtist, type WorkshopArtistPublic } from "@/lib/workshops/shared";

// 공개 조회는 anon 클라이언트 + RLS 로 읽는다.
// `workshop_artists_public_select` 정책이 published/recruiting/confirmed/completed 만 통과시키므로
// 코드에서 상태 필터를 빠뜨려도 비공개 제안(suggested)이 새지 않는다.
// demands·reservations 는 계속 잠겨 있고, 카드에 필요한 "수"만 `workshop_public_counts()` RPC 로 가져온다.

const ARTIST_COLUMNS =
  "id, slug, name, instagram_handle, image_url, country, genres, headline, description, status, deposit_amount, total_price, min_headcount, max_headcount, expected_period, recruit_deadline, recruit_opened_at, confirmed_at, created_at";

type CountRow = { artist_id: string; demand_count: number; reserved_count: number };

async function loadCounts(): Promise<Map<string, { demand: number; reserved: number }>> {
  const map = new Map<string, { demand: number; reserved: number }>();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workshop_public_counts");
  if (error) {
    console.error("[workshops] counts rpc failed:", error);
    return map;
  }
  for (const row of (data ?? []) as CountRow[]) {
    map.set(row.artist_id, { demand: row.demand_count ?? 0, reserved: row.reserved_count ?? 0 });
  }
  return map;
}

function withCounts(
  artists: WorkshopArtist[],
  counts: Map<string, { demand: number; reserved: number }>,
): WorkshopArtistPublic[] {
  return artists.map((a) => ({
    ...a,
    genres: a.genres ?? [],
    demand_count: counts.get(a.id)?.demand ?? 0,
    reserved_count: counts.get(a.id)?.reserved ?? 0,
  }));
}

/** 공개 카드 목록 — 수요 많은 순, 동률이면 최신순. */
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
  rows.sort((a, b) => b.demand_count - a.demand_count || b.created_at.localeCompare(a.created_at));
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

// ── '다른 댄서들이 희망한 안무가' ───────────────────────────────────────────
// suggested 카드는 RLS 가 anon 에게 숨기므로(공개 카드 아님) 서버에서 service-role 로 읽되,
// 이름·핸들·수요 수만 내보낸다(제출자 연락처 등은 절대 포함하지 않는다).

export type WorkshopWishRow = { name: string; instagram_handle: string; demand_count: number };

export async function listWorkshopWishes(limit = 24): Promise<WorkshopWishRow[]> {
  const admin = createAdminClient();
  const { data: artists } = await admin
    .from("workshop_artists")
    .select("id, name, instagram_handle")
    .eq("status", "suggested")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (artists ?? []) as { id: string; name: string; instagram_handle: string }[];
  if (rows.length === 0) return [];

  const { data: demands } = await admin
    .from("workshop_demands")
    .select("artist_id")
    .in(
      "artist_id",
      rows.map((r) => r.id),
    );
  const counts = new Map<string, number>();
  for (const d of demands ?? []) {
    const id = d.artist_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return rows
    .map((r) => ({
      name: r.name,
      instagram_handle: r.instagram_handle,
      demand_count: counts.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.demand_count - a.demand_count)
    .slice(0, limit);
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

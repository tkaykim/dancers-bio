import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  PUBLIC_STATUSES,
  type WorkshopArtist,
  type WorkshopArtistPublic,
} from "@/lib/workshops/shared";

// workshop_* 테이블은 RLS default-deny(service-role 전용)라
// 공개 페이지도 서버 컴포넌트에서 admin client로 읽어 렌더한다.

const ARTIST_COLUMNS =
  "id, slug, name, instagram_handle, image_url, country, genres, headline, description, status, deposit_amount, total_price, min_headcount, max_headcount, expected_period, recruit_deadline, recruit_opened_at, confirmed_at, created_at";

async function countBy(
  table: "workshop_demands" | "workshop_reservations",
  artistIds: string[],
  reservedOnly: boolean,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (artistIds.length === 0) return map;
  const admin = createAdminClient();
  let query = admin.from(table).select("artist_id").in("artist_id", artistIds);
  if (reservedOnly) query = query.in("status", ["paid", "confirmed"]);
  const { data } = await query;
  for (const row of data ?? []) {
    const id = row.artist_id as string;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

function withCounts(
  artists: WorkshopArtist[],
  demands: Map<string, number>,
  reserved: Map<string, number>,
): WorkshopArtistPublic[] {
  return artists.map((a) => ({
    ...a,
    genres: a.genres ?? [],
    demand_count: demands.get(a.id) ?? 0,
    reserved_count: reserved.get(a.id) ?? 0,
  }));
}

/** 공개 카드 목록 — 모집 중 우선, 이후 수요 순. */
export async function listPublicWorkshopArtists(): Promise<WorkshopArtistPublic[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_artists")
    .select(ARTIST_COLUMNS)
    .in("status", PUBLIC_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[workshops] list failed:", error);
    return [];
  }
  const artists = (data ?? []) as WorkshopArtist[];
  const ids = artists.map((a) => a.id);
  const [demands, reserved] = await Promise.all([
    countBy("workshop_demands", ids, false),
    countBy("workshop_reservations", ids, true),
  ]);
  const rows = withCounts(artists, demands, reserved);
  // 수요 많은 순으로 정렬하되, 최신 카드가 완전히 묻히지 않게 동률이면 최신순.
  rows.sort((a, b) => b.demand_count - a.demand_count || b.created_at.localeCompare(a.created_at));
  return rows;
}

/** 상세 페이지용 단건 조회 (suggested/archived 는 공개하지 않는다). */
export async function getPublicWorkshopArtistBySlug(slug: string): Promise<WorkshopArtistPublic | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_artists")
    .select(ARTIST_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const artist = data as WorkshopArtist;
  if (!PUBLIC_STATUSES.includes(artist.status)) return null;
  const [demands, reserved] = await Promise.all([
    countBy("workshop_demands", [artist.id], false),
    countBy("workshop_reservations", [artist.id], true),
  ]);
  return withCounts([artist], demands, reserved)[0] ?? null;
}

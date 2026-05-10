import { createClient } from "@/lib/supabase/server";

export type DancerListItem = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  specialties: string[] | null;
  profile_id: string | null;
};

export const DANCER_PAGE_SIZE = 12;

/**
 * Fetches one page of approved dancers for the public directory.
 *
 * Uses the partial index `dancers_listing_order_idx`
 * (display_order DESC NULLS LAST, created_at DESC) WHERE approval_status='approved'.
 * Search uses trigram indexes on stage_name / korean_name.
 *
 * Returns at most `pageSize` rows; an empty/short result signals "no more".
 */
export async function fetchDancerPage({
  q,
  offset,
  pageSize = DANCER_PAGE_SIZE,
}: {
  q?: string;
  offset: number;
  pageSize?: number;
}): Promise<DancerListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("dancers")
    .select(
      "id, stage_name, korean_name, slug, profile_img, location, genres, specialties, profile_id",
    )
    .eq("approval_status", "approved")
    .order("display_order", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const trimmed = (q ?? "").trim();
  if (trimmed) {
    const safe = trimmed.replace(/[%_,]/g, "");
    query = query.or(
      `stage_name.ilike.%${safe}%,korean_name.ilike.%${safe}%`,
    );
  }

  const { data } = await query;
  return (data ?? []) as DancerListItem[];
}

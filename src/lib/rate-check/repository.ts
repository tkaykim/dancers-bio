import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RateCheckData } from "./types";

// Temporary explicit schema until Claude applies the migration and regenerates db:types.
export function rateChecksTable() {
  return (createAdminClient() as unknown as SupabaseClient).from("rate_checks");
}

export type RateCheckRow = {
  id: string; ig_handle: string; followers: number | null; full_name: string | null;
  profile_pic_url: string | null; is_private: boolean; reels: RateCheckData["reels"];
  reels_used: number; sample_status: RateCheckData["sampleStatus"];
  trimmed_mean: number | null; median_views: number | null; views_low: number | null;
  views_high: number | null; expected_views: number | null; tier: RateCheckData["tier"];
  f_base: number | null; v_base: number | null; formula_rate: number | null;
  created_at: string; created_by: string | null; error: string | null;
  creator?: { display_name: string | null } | null;
};

// Explicit projection excludes raw on both cache reads and history reads.
export const RATE_CHECK_COLUMNS = "id,ig_handle,followers,full_name,profile_pic_url,is_private,reels,reels_used,sample_status,trimmed_mean,median_views,views_low,views_high,expected_views,tier,f_base,v_base,formula_rate,created_at,created_by,error,creator:profiles!rate_checks_created_by_fkey(display_name)";

export function toRateCheckData(row: RateCheckRow, cached = false): RateCheckData {
  return {
    id: row.id, handle: row.ig_handle, followers: row.followers, fullName: row.full_name,
    profilePicUrl: row.profile_pic_url, isPrivate: row.is_private, reels: row.reels,
    reelsUsed: row.reels_used, sampleStatus: row.sample_status, trimmedMean: row.trimmed_mean,
    median: row.median_views, viewsLow: row.views_low, viewsHigh: row.views_high,
    expectedViews: row.expected_views, tier: row.tier, fBase: row.f_base, vBase: row.v_base,
    formulaRate: row.formula_rate, cached,
    createdAt: row.created_at, createdBy: row.creator?.display_name ?? row.created_by, error: row.error,
  };
}

export function kstDayStart(now = new Date()): string {
  const day = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+09:00`).toISOString();
}

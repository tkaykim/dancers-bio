import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyDancerCandidate } from "@/lib/ingest/dancer";

/**
 * External discovery webhook. A follow-graph crawler POSTs candidate IG accounts;
 * we classify each, drop non-dancers, and upsert survivors into ig_discovery.
 *
 * Auth: shared secret in body (`secret`) compared against INGEST_WEBHOOK_SECRET.
 * If the env is unset the endpoint is hard-disabled (503) so it can't be probed
 * before a secret is provisioned.
 */

interface Candidate {
  ig_user_id: string;
  ig_handle?: string;
  display_name?: string;
  follower_count?: number;
  bio_text?: string;
  mutuals_with_seed?: number;
  source?: string;
}

export async function POST(req: Request) {
  const expected = process.env.INGEST_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "INGEST_WEBHOOK_SECRET 미설정 — 웹훅 비활성. TODO: 운영 환경변수 설정 후 활성화.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      secret?: string;
      candidates?: Candidate[];
    } | null;

    if (!body || typeof body.secret !== "string") {
      return NextResponse.json(
        { ok: false, error: "bad_request" },
        { status: 400 },
      );
    }
    if (body.secret !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const admin = createAdminClient();

    let inserted = 0;
    let skipped = 0;
    let duplicates = 0;
    const now = new Date().toISOString();

    for (const c of candidates) {
      const igUserId = (c?.ig_user_id ?? "").toString().trim();
      if (!igUserId) {
        skipped += 1;
        continue;
      }

      const { isDancer, bioKeywordHit, rankScore } = classifyDancerCandidate({
        bio_text: c.bio_text ?? null,
        ig_handle: c.ig_handle ?? null,
        display_name: c.display_name ?? null,
        mutuals_with_seed: c.mutuals_with_seed ?? 0,
      });

      if (!isDancer) {
        skipped += 1;
        continue;
      }

      // Best-effort match against an existing dancer by IG handle.
      let matchedDancerId: string | null = null;
      const handle = (c.ig_handle ?? "").toString().trim();
      if (handle) {
        const { data: existing } = await admin
          .from("dancers")
          .select("id")
          .eq("social_links->>instagram", handle)
          .maybeSingle();
        if (existing?.id) matchedDancerId = existing.id as string;
      }

      const { data: row, error } = await admin
        .from("ig_discovery")
        .upsert(
          {
            ig_user_id: igUserId,
            ig_handle: c.ig_handle ?? null,
            display_name: c.display_name ?? null,
            follower_count:
              typeof c.follower_count === "number" ? c.follower_count : null,
            mutuals_with_seed:
              typeof c.mutuals_with_seed === "number"
                ? c.mutuals_with_seed
                : 0,
            bio_text: c.bio_text ?? null,
            bio_keyword_hit: bioKeywordHit,
            rank_score: rankScore,
            source: c.source ?? "follow_graph",
            status: "discovered",
            matched_dancer_id: matchedDancerId,
            discovered_at: now,
            updated_at: now,
          },
          { onConflict: "ig_user_id", ignoreDuplicates: true },
        )
        .select("id");

      if (error) {
        // Treat row-level failure as a skip rather than aborting the batch.
        skipped += 1;
        continue;
      }

      if (row && row.length > 0) {
        inserted += 1;
      } else {
        // ignoreDuplicates → no row returned means it already existed.
        duplicates += 1;
      }
    }

    return NextResponse.json({ ok: true, inserted, skipped, duplicates });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

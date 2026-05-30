import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreCareer, aggregateDancerScore } from "./career-score";

/**
 * 경력 점수 재계산. service-role 클라이언트로 score 테이블(admin-only RLS)에 기록.
 * 점수 산식은 ./career-score.ts (단일 소스, 단위 테스트로 검증).
 */

type CareerRow = {
  id: number;
  dancer_id: string | null;
  type: string | null;
  title: string | null;
  date: string | null;
  is_representative: boolean | null;
};

const PAGE = 1000;
const UPSERT_CHUNK = 500;

async function fetchAllCareers(
  admin: SupabaseClient,
  dancerIds?: string[],
): Promise<CareerRow[]> {
  const all: CareerRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("careers")
      .select("id, dancer_id, type, title, date, is_representative")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (dancerIds && dancerIds.length > 0) q = q.in("dancer_id", dancerIds);
    const { data, error } = await q;
    if (error) throw new Error(`careers fetch: ${error.message}`);
    const rows = (data ?? []) as CareerRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

async function chunkedUpsert(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

export type RecomputeSummary = {
  careersScored: number;
  dancersScored: number;
};

/**
 * 전체(또는 일부 dancerIds) 재계산.
 * - dancerIds 미지정: 모든 경력 + 모든 댄서 (백필/전체 재계산).
 * - dancerIds 지정: 해당 댄서들의 경력만 재채점 + 그 댄서 집계 갱신(증분).
 */
export async function recomputeScores(
  admin: SupabaseClient,
  dancerIds?: string[],
): Promise<RecomputeSummary> {
  const nowYear = new Date().getFullYear();

  // 대상 댄서 목록 + is_verified
  let dancerQuery = admin.from("dancers").select("id, is_verified");
  if (dancerIds && dancerIds.length > 0) dancerQuery = dancerQuery.in("id", dancerIds);
  const { data: dancersData, error: dErr } = await dancerQuery;
  if (dErr) throw new Error(`dancers fetch: ${dErr.message}`);
  const verifiedById = new Map<string, boolean>(
    (dancersData ?? []).map((d: { id: string; is_verified: boolean | null }) => [
      d.id,
      !!d.is_verified,
    ]),
  );

  const careers = await fetchAllCareers(admin, dancerIds);

  // 경력별 점수
  const computedAt = new Date().toISOString();
  const careerRows: Record<string, unknown>[] = [];
  const scoresByDancer = new Map<string, number[]>();
  for (const c of careers) {
    const b = scoreCareer(
      { type: c.type, title: c.title, date: c.date, is_representative: c.is_representative },
      nowYear,
    );
    careerRows.push({
      career_id: c.id,
      score: b.score,
      breakdown: b,
      computed_at: computedAt,
    });
    if (c.dancer_id) {
      const arr = scoresByDancer.get(c.dancer_id) ?? [];
      arr.push(b.score);
      scoresByDancer.set(c.dancer_id, arr);
    }
  }

  // 댄서별 집계 — 대상 댄서 전원(경력 없으면 0점)
  const dancerRows: Record<string, unknown>[] = [];
  for (const [dancerId] of verifiedById) {
    const careerScores = scoresByDancer.get(dancerId) ?? [];
    const agg = aggregateDancerScore(careerScores, {
      isVerified: verifiedById.get(dancerId),
    });
    dancerRows.push({
      dancer_id: dancerId,
      score: agg.score,
      career_count: agg.careerCount,
      breakdown: agg,
      computed_at: computedAt,
    });
  }

  await chunkedUpsert(admin, "career_scores", careerRows, "career_id");
  await chunkedUpsert(admin, "dancer_scores", dancerRows, "dancer_id");

  return { careersScored: careerRows.length, dancersScored: dancerRows.length };
}

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeScores } from "@/lib/scoring/recompute";

/**
 * 경력 점수 백필/전체 재계산 엔드포인트.
 *
 * 인증: admin 쿠키 세션, 또는 ?token=<SCORING_RECOMPUTE_TOKEN env 일치>.
 * token env 미설정 시 우회 비활성(기본 admin-only). 운영 트리거/일회성 백필용.
 *
 * 장시간 작업이라 maxDuration 상향.
 */
export const maxDuration = 300;

async function authorized(req: NextRequest): Promise<boolean> {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.SCORING_RECOMPUTE_TOKEN;
  if (token && expected && token === expected) return true;
  const profile = await getProfile();
  return !!profile?.is_admin;
}

async function handle(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const summary = await recomputeScores(admin);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

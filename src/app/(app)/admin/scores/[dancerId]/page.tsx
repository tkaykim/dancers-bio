import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

/**
 * 관리자 전용 — 한 댄서의 경력별 점수 분해.
 * career_scores / dancer_scores 는 admin-only RLS.
 */

type CareerScoreBreakdown = {
  base: number;
  keywordTier: "S" | "A" | "B" | null;
  keywordMult: number;
  recency: number;
  repBonus: number;
  score: number;
};

type CareerRow = {
  id: number;
  title: string | null;
  type: string | null;
  date: string | null;
};

export default async function AdminDancerScorePage({
  params,
}: {
  params: Promise<{ dancerId: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();
  const { dancerId } = await params;

  const supabase = await createClient();

  const [{ data: dancer }, { data: dscore }, { data: careers }] = await Promise.all([
    supabase
      .from("dancers")
      .select("id, stage_name, korean_name, is_verified, approval_status, is_active")
      .eq("id", dancerId)
      .maybeSingle(),
    supabase
      .from("dancer_scores")
      .select("score, career_count, breakdown, computed_at")
      .eq("dancer_id", dancerId)
      .maybeSingle(),
    supabase
      .from("careers")
      .select("id, title, type, date")
      .eq("dancer_id", dancerId),
  ]);

  if (!dancer) notFound();

  const careerList = (careers ?? []) as CareerRow[];
  const careerIds = careerList.map((c) => c.id);
  const scoreByCareer = new Map<number, CareerScoreBreakdown & { score: number }>();
  if (careerIds.length > 0) {
    const { data: cs } = await supabase
      .from("career_scores")
      .select("career_id, score, breakdown")
      .in("career_id", careerIds);
    for (const r of (cs ?? []) as {
      career_id: number;
      score: number;
      breakdown: CareerScoreBreakdown;
    }[]) {
      scoreByCareer.set(r.career_id, { ...r.breakdown, score: Number(r.score) });
    }
  }

  const merged = careerList
    .map((c) => ({ career: c, b: scoreByCareer.get(c.id) ?? null }))
    .sort((a, b) => (b.b?.score ?? 0) - (a.b?.score ?? 0));

  const d = dancer as {
    stage_name: string;
    korean_name: string | null;
    is_verified: boolean | null;
  };
  const ds = dscore as
    | { score: number; career_count: number; computed_at: string }
    | null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 경력 점수 / 상세
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {d.stage_name}
          {d.korean_name ? (
            <span className="ml-2 text-base font-normal text-ink-3">
              {d.korean_name}
            </span>
          ) : null}
          {d.is_verified ? <span className="ml-2 text-sm text-primary">✓</span> : null}
        </h1>
        {ds ? (
          <p className="text-sm text-ink-2">
            총점 <strong className="font-mono">{Number(ds.score).toFixed(1)}</strong>
            {" · "}경력 {ds.career_count}건{" · "}
            <span className="text-ink-3">
              {new Date(ds.computed_at).toLocaleString("ko-KR")} 계산
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-3">아직 점수가 계산되지 않았습니다.</p>
        )}
      </header>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1fr_3.5rem] items-center gap-2 border-b border-border bg-card px-3 py-2 text-[10px] uppercase tracking-wider text-ink-3">
          <span>경력 (점수순)</span>
          <span className="text-right">점수</span>
        </div>
        <ul>
          {merged.map(({ career, b }) => (
            <li
              key={career.id}
              className="flex flex-col gap-1 border-b border-border px-3 py-2.5 last:border-b-0"
            >
              <div className="grid grid-cols-[1fr_3.5rem] items-start gap-2">
                <span className="min-w-0 text-sm">
                  {career.title ?? "(제목 없음)"}
                </span>
                <span className="text-right font-mono text-sm font-semibold">
                  {b ? b.score.toFixed(1) : "—"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] text-ink-3">
                <Chip>{career.type ?? "other"}</Chip>
                {career.date ? <Chip>{career.date.slice(0, 4)}</Chip> : null}
                {b ? (
                  <>
                    <Chip>base {b.base}</Chip>
                    <Chip>
                      키워드 {b.keywordTier ?? "—"} ×{b.keywordMult}
                    </Chip>
                    <Chip>최신성 ×{b.recency}</Chip>
                    {b.repBonus ? <Chip>대표 +{b.repBonus}</Chip> : null}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/admin/scores"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← 랭킹으로
      </Link>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-ink-2">
      {children}
    </span>
  );
}

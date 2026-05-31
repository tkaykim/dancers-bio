import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

/**
 * 관리자 전용 경력점수 랭킹. dancer_scores 는 admin-only RLS 라 admin 세션만 읽힌다.
 * 일반 사용자/네트워크에는 절대 노출되지 않는 내부 점수.
 */

type Row = {
  dancer_id: string;
  score: number;
  career_count: number;
  dancers: {
    stage_name: string;
    korean_name: string | null;
    slug: string | null;
    is_verified: boolean | null;
    approval_status: string;
    is_active: boolean;
  } | null;
};

export default async function AdminScoresPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dancer_scores")
    .select(
      "dancer_id, score, career_count, dancers ( stage_name, korean_name, slug, is_verified, approval_status, is_active )",
    )
    .order("score", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 경력 점수
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          경력 점수 랭킹 (내부)
        </h1>
        <p className="text-sm text-ink-2">
          프로 근접도 점수 내림차순. 디렉토리(`/dancers`) 정렬 기준이며 사용자에게는
          노출되지 않습니다. 행을 누르면 경력별 점수 분해를 볼 수 있어요.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          점수 조회 실패: {error.message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[2.5rem_1fr_4rem_3.5rem] items-center gap-2 border-b border-border bg-card px-3 py-2 text-[10px] uppercase tracking-wider text-ink-3">
          <span>#</span>
          <span>댄서</span>
          <span className="text-right">점수</span>
          <span className="text-right">경력</span>
        </div>
        <ul>
          {rows.map((r, i) => {
            const d = r.dancers;
            const masked = !d || d.approval_status !== "approved" || !d.is_active;
            return (
              <li key={r.dancer_id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/admin/scores/${r.dancer_id}`}
                  className="grid grid-cols-[2.5rem_1fr_4rem_3.5rem] items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="font-mono text-xs text-ink-3">{i + 1}</span>
                  <span className="min-w-0 truncate">
                    {d?.stage_name ?? "(삭제됨)"}
                    {d?.korean_name ? (
                      <span className="ml-1 text-xs text-ink-3">{d.korean_name}</span>
                    ) : null}
                    {d?.is_verified ? (
                      <span className="ml-1 text-[10px] text-primary">✓</span>
                    ) : null}
                    {masked ? (
                      <span className="ml-1 rounded bg-secondary px-1 py-0.5 text-[9px] text-ink-3">
                        미노출
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right font-mono font-semibold">
                    {Number(r.score).toFixed(1)}
                  </span>
                  <span className="text-right font-mono text-xs text-ink-3">
                    {r.career_count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← admin 홈
      </Link>
    </div>
  );
}

import { CheckCircle2, Circle } from "lucide-react";
import type { ProfileScoreResult } from "@/lib/scoring/profile-score";

/**
 * 프로필 완성도 카드 — 댄서 본인에게 보이는 유일한 점수.
 *
 * 여기 담기는 건 본인이 입력했거나 입력하지 않은 사실뿐이다.
 * 내부 평가(경력점수·현장 신뢰도·종합 DQS·등급)는 이 화면에 절대 넣지 않는다.
 * 정책: docs/QUALITY_PLAN.md §4
 */
export function ProfileCompletenessCard({
  result,
}: {
  result: ProfileScoreResult;
}) {
  const done = result.items.filter((it) => it.earned >= it.max);
  const todo = result.missing;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">프로필 완성도</h2>
        <span className="text-2xl font-bold tabular-nums">{result.percent}%</span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={result.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="프로필 완성도"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${result.percent}%` }}
        />
      </div>

      {todo.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-ink-2">아직 비어 있는 항목</p>
          <ul className="flex flex-col gap-2">
            {todo.map((it) => (
              <li key={it.key} className="flex items-start gap-2">
                <Circle size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium">{it.label}</span>
                  <span className="text-[11px] leading-snug text-ink-3">{it.hint}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-ok">프로필을 빠짐없이 채우셨습니다.</p>
      )}

      {done.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {done.map((it) => (
            <span
              key={it.key}
              className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/5 px-2 py-0.5 text-[10px] text-ok"
            >
              <CheckCircle2 size={10} aria-hidden />
              {it.label}
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-[11px] leading-snug text-ink-3">
        완성도는 본인에게만 보입니다.
        <br />
        비어 있는 항목을 채우면 캐스팅 담당자가 판단할 수 있는 정보가 늘어납니다.
      </p>
    </section>
  );
}

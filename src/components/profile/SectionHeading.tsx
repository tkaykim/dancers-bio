import type { ReactNode } from "react";

/**
 * 매거진형 섹션 헤더 — 넘버링(01·02…) + 라벨 + 오른쪽으로 뻗는 헤어라인 룰.
 * deetz 화이트 에디토리얼 톤에 맞춘 공용 헤더 (댄서/팀 공개 페이지 공유).
 */
export function SectionHeading({
  index,
  count,
  action,
  children,
}: {
  index?: string;
  count?: number | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {index ? (
        <span className="font-mono text-[11px] tabular-nums text-ink-4">
          {index}
        </span>
      ) : null}
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
        {children}
      </h2>
      {typeof count === "number" ? (
        <span className="font-mono text-[11px] text-ink-4">{count}</span>
      ) : null}
      <span className="h-px flex-1 bg-hairline-2" aria-hidden />
      {action}
    </div>
  );
}

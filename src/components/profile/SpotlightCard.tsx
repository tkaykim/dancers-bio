/**
 * 매거진형 스팟라이트 카드 — bio 를 에디토리얼 피처로 표현.
 * 썸네일 + eyebrow + 큰 인용부호 리드 + 브랜드 워터마크(deetz).
 * hypetown 의 "Magazine / Rising Artist" 피처 카드 대응 (deetz 화이트 톤).
 */
export function SpotlightCard({
  body,
  eyebrow,
  name,
  thumb,
}: {
  body: string;
  eyebrow?: string;
  name: string;
  thumb?: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-2 p-5">
      <span className="absolute right-4 top-4 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-4">
        deetz
      </span>
      <div className="flex gap-4">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={name}
            className="h-24 w-[72px] shrink-0 rounded-lg object-cover ring-1 ring-hairline-2"
          />
        ) : null}
        <div className="min-w-0 pr-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-3">
            {eyebrow || "Spotlight"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
            <span className="mr-0.5 font-serif text-lg leading-none text-ink-3">“</span>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

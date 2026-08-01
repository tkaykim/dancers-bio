export function ProfileSectionHeading({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  count?: number | null;
}) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-hairline-2 pb-4">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-2">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-2">
            {description}
          </p>
        ) : null}
      </div>
      {typeof count === "number" ? (
        <span className="shrink-0 font-mono text-sm tabular-nums text-ink-2">
          {String(count).padStart(2, "0")}
        </span>
      ) : null}
    </div>
  );
}

import type { BoardView } from "@/lib/casting/board-data";
import { CardSection } from "@/components/casting/CardSection";

export function CastingBoardView({ board }: { board: BoardView }) {
  const { settings, cards, counts } = board;
  const gp = settings.genderPriority;
  const males = cards.filter((c) => c.gender === "male");
  const females = cards.filter((c) => c.gender === "female");
  const others = cards.filter((c) => c.gender !== "male" && c.gender !== "female");

  const maleSec = (
    <CardSection key="m" label="남자 댄서" cards={males} fields={settings.fields} />
  );
  const femaleSec = (
    <CardSection key="f" label="여자 댄서" cards={females} fields={settings.fields} />
  );
  const ordered = gp === "female" ? [femaleSec, maleSec] : [maleSec, femaleSec];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="border-b-2 border-ink-1 pb-5">
        <div className="text-3xl font-extrabold leading-none tracking-tight">
          deetz<span className="text-hairline">.</span>
        </div>
        <div className="mt-1 text-xs text-ink-3">댄서 매거진 &amp; 캐스팅 플랫폼</div>
        {board.title ? (
          <h1 className="mt-4 text-xl font-bold">{board.title}</h1>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            총 <b>{counts.total}</b>명
          </span>
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            남 <b>{counts.male}</b>
          </span>
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            여 <b>{counts.female}</b>
          </span>
        </div>
      </header>

      {counts.total === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">표시할 인원이 없습니다.</p>
      ) : (
        <>
          {ordered}
          {others.length ? (
            <CardSection label="기타" cards={others} fields={settings.fields} />
          ) : null}
        </>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-[10px] text-ink-3">
        deetz · deetz.kr · 본 자료는 캐스팅 검토용이며 외부 유출을 금합니다.
      </footer>
    </div>
  );
}

import type { BoardView } from "@/lib/casting/board-data";
import { CardSection } from "@/components/casting/CardSection";
import { CommentDock } from "@/components/casting/CommentDock";
import { BoardNotesEditor } from "@/components/casting/BoardNotesEditor";
import { DeetzLogo } from "@/components/brand/DeetzLogo";

export function CastingBoardView({
  board,
  canManage = false,
}: {
  board: BoardView;
  canManage?: boolean;
}) {
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
        <DeetzLogo className="h-8 w-auto" priority />
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

      {canManage ? (
        <BoardNotesEditor boardId={board.id} initialNotes={board.notes} />
      ) : board.notes.length ? (
        <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3.5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
            참고사항
          </p>
          <div className="flex flex-col gap-3">
            {board.notes.map((n, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-3"
              >
                {n}
              </p>
            ))}
          </div>
        </div>
      ) : null}

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

      <CommentDock shareCode={board.shareCode} />
    </div>
  );
}

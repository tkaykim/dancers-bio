"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BoardView } from "@/lib/casting/board-data";
import type { ClientDecision } from "@/lib/casting/review";
import { CardSection } from "@/components/casting/CardSection";
import { CommentDock } from "@/components/casting/CommentDock";
import { BoardNotesEditor } from "@/components/casting/BoardNotesEditor";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { ProposalRateTable } from "@/components/casting/ProposalRateTable";
import { submitCastingBoardReviewAction } from "@/app/actions/casting-review";

export function CastingBoardView({
  board,
  canManage = false,
  reviewToken,
}: {
  board: BoardView;
  canManage?: boolean;
  reviewToken?: string;
}) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const { settings, cards, counts } = board;
  const isReview = Boolean(reviewToken && board.review.authorized);
  const initialChoices = useMemo(
    () =>
      Object.fromEntries(
        cards.map((card) => [card.memberId, card.clientDecision ?? "undecided"]),
      ) as Record<string, ClientDecision>,
    [cards],
  );
  const [choices, setChoices] = useState<Record<string, ClientDecision>>(
    initialChoices,
  );
  const [savedChoices, setSavedChoices] =
    useState<Record<string, ClientDecision>>(initialChoices);
  const [reviewerName, setReviewerName] = useState("");
  const gp = settings.genderPriority;
  const males = cards.filter((c) => c.gender === "male");
  const females = cards.filter((c) => c.gender === "female");
  const others = cards.filter((c) => c.gender !== "male" && c.gender !== "female");

  const dirtyCards = cards.filter(
    (card) => choices[card.memberId] !== savedChoices[card.memberId],
  );
  const choiceCounts = cards.reduce(
    (acc, card) => {
      acc[choices[card.memberId] ?? "undecided"] += 1;
      return acc;
    },
    { undecided: 0, selected: 0, hold: 0, excluded: 0 } as Record<
      ClientDecision,
      number
    >,
  );
  const reviewControls = isReview
    ? {
        choices,
        disabled: submitting,
        onChange: (memberId: string, decision: ClientDecision) =>
          setChoices((current) => ({ ...current, [memberId]: decision })),
      }
    : undefined;

  const maleSec = (
    <CardSection
      key="m"
      label="남자 댄서"
      cards={males}
      fields={settings.fields}
      review={reviewControls}
    />
  );
  const femaleSec = (
    <CardSection
      key="f"
      label="여자 댄서"
      cards={females}
      fields={settings.fields}
      review={reviewControls}
    />
  );
  const ordered = gp === "female" ? [femaleSec, maleSec] : [maleSec, femaleSec];

  function submitReview() {
    if (!reviewToken) return;
    if (!reviewerName.trim()) {
      toast.error("검토자 이름을 입력해 주세요.");
      return;
    }
    if (dirtyCards.length === 0) {
      toast.error("변경된 선택이 없습니다.");
      return;
    }
    const fd = new FormData();
    fd.set("review_token", reviewToken);
    fd.set("reviewer_name", reviewerName.trim());
    fd.set(
      "decisions",
      JSON.stringify(
        dirtyCards.map((card) => ({
          memberId: card.memberId,
          decision: choices[card.memberId] ?? "undecided",
        })),
      ),
    );
    startSubmit(async () => {
      const result = await submitCastingBoardReviewAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSavedChoices({ ...choices });
      toast.success(`검토 결과 ${result.data?.updated ?? 0}건을 저장했습니다.`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="border-b-2 border-ink-1 pb-5">
        <DeetzLogo className="h-8 w-auto" priority />
        {isReview ? (
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            클라이언트 전용 검토
          </p>
        ) : null}
        {board.title ? (
          <h1 className={isReview ? "mt-1 text-xl font-bold" : "mt-4 text-xl font-bold"}>
            {board.title}
          </h1>
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

      <ProposalRateTable table={settings.rateTable} cards={cards} />

      <div className="mt-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900">
        본 명단은 <b>캐스팅 검토 전용</b>입니다.
        무단 외부 공유를 금지합니다.
      </div>

      {isReview ? (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold">후보를 검토해 주세요.</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            각 카드에서 선택·보류·제외를 표시한 뒤 아래 저장 버튼을 눌러주세요.
            이 단계에서는 지원자에게 결과가 전달되지 않습니다.
          </p>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-ink-2 sm:max-w-xs">
            검토자 이름
            <input
              value={reviewerName}
              onChange={(event) => setReviewerName(event.target.value)}
              maxLength={80}
              placeholder="예: 김초롱"
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          {board.review.submittedAt ? (
            <p className="mt-2 text-[11px] text-ink-3">
              최근 저장 {new Date(board.review.submittedAt).toLocaleString("ko-KR")}
              {board.review.submittedBy ? ` · ${board.review.submittedBy}` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

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
            <CardSection
              label="기타"
              cards={others}
              fields={settings.fields}
              review={reviewControls}
            />
          ) : null}
        </>
      )}

      {isReview ? (
        <div className="sticky bottom-3 z-20 mt-8 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
            <span>선택 <b>{choiceCounts.selected}</b></span>
            <span>보류 <b>{choiceCounts.hold}</b></span>
            <span>제외 <b>{choiceCounts.excluded}</b></span>
            <span>미검토 <b>{choiceCounts.undecided}</b></span>
            <span className="ml-auto text-primary">변경 {dirtyCards.length}건</span>
          </div>
          <button
            type="button"
            disabled={submitting || dirtyCards.length === 0}
            onClick={submitReview}
            className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-45"
          >
            {submitting ? "저장 중..." : "검토 결과 저장"}
          </button>
        </div>
      ) : null}

      <footer className="mt-10 border-t border-border pt-4 text-[10px] text-ink-3">
        deetz · deetz.kr · 본 자료는 캐스팅 검토용이며 외부 유출을 금합니다.
      </footer>

      <CommentDock shareCode={board.shareCode} />
    </div>
  );
}

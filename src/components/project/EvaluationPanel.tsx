"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listApplicationEvaluationsAction,
  upsertApplicationEvaluationAction,
  deleteApplicationEvaluationAction,
  type EvaluationRow,
} from "@/app/actions/evaluations";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function EvaluationPanel({
  open,
  applicationId,
  canScore,
  onMyScoreChange,
}: {
  open: boolean;
  applicationId: string | null;
  canScore: boolean;
  onMyScoreChange?: (score: number | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myComment, setMyComment] = useState("");
  const [savedComment, setSavedComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !applicationId) {
      setRows([]);
      setMyScore(null);
      setMyComment("");
      setSavedComment("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    listApplicationEvaluationsAction(applicationId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) return;
      const list = r.data?.evaluations ?? [];
      setRows(list);
      const mine = list.find((e) => e.isMine);
      setMyScore(mine?.score ?? null);
      setMyComment(mine?.comment ?? "");
      setSavedComment(mine?.comment ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  const others = rows.filter((e) => !e.isMine);
  const avg =
    rows.length > 0
      ? rows.reduce((s, e) => s + e.score, 0) / rows.length
      : null;

  async function save(score: number, comment: string) {
    if (!applicationId) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("application_id", applicationId);
    fd.set("score", String(score));
    fd.set("comment", comment);
    const r = await upsertApplicationEvaluationAction(fd);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setSavedComment(comment);
    onMyScoreChange?.(score);
    return true;
  }

  async function pick(score: number) {
    if (!canScore || busy) return;
    const prev = myScore;
    setMyScore(score); // 낙관적
    const ok = await save(score, myComment);
    if (!ok) {
      setMyScore(prev);
      return;
    }
    // 내 행을 목록에도 반영(없으면 추가).
    setRows((prevRows) => {
      const idx = prevRows.findIndex((e) => e.isMine);
      const mineRow: EvaluationRow = {
        evaluatorId: "me",
        evaluatorName: "나",
        evaluatorAvatar: null,
        score,
        comment: myComment || null,
        isMine: true,
        updatedAt: new Date().toISOString(),
      };
      if (idx === -1) return [mineRow, ...prevRows];
      const next = [...prevRows];
      next[idx] = { ...next[idx], score, comment: myComment || null };
      return next;
    });
  }

  async function clearMine() {
    if (!applicationId || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("application_id", applicationId);
    const r = await deleteApplicationEvaluationAction(fd);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setMyScore(null);
    setMyComment("");
    setSavedComment("");
    setRows((prev) => prev.filter((e) => !e.isMine));
    onMyScoreChange?.(null);
  }

  function commentBlur() {
    if (myScore == null) return; // 점수가 있어야 저장 가능
    if (myComment.trim() === savedComment.trim()) return;
    save(myScore, myComment.trim());
  }

  if (!canScore) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          사전선별 점수
        </p>
        {avg != null ? (
          <p className="text-[11px] text-ink-3">
            평균 {avg.toFixed(1)} · {rows.length}명
          </p>
        ) : null}
      </div>

      {/* 1~10 점수 — 탭하면 바로 저장 */}
      <div className="flex flex-wrap gap-1.5">
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => pick(n)}
            className={`flex h-8 min-w-8 items-center justify-center rounded-lg border px-1 text-sm transition-colors disabled:opacity-50 ${
              myScore === n
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border text-ink-2 hover:bg-secondary"
            }`}
            aria-label={`${n}점`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-3">
          {myScore != null ? (
            <>
              내 점수 <span className="font-semibold text-primary">{myScore}</span> · 탭하면 바로 저장
            </>
          ) : (
            "숫자를 누르면 바로 저장됩니다"
          )}
        </p>
        {myScore != null ? (
          <button
            type="button"
            onClick={clearMine}
            disabled={busy}
            className="text-[11px] text-ink-3 underline hover:text-foreground disabled:opacity-50"
          >
            내 점수 지우기
          </button>
        ) : null}
      </div>

      <textarea
        value={myComment}
        onChange={(e) => setMyComment(e.target.value)}
        onBlur={commentBlur}
        placeholder={
          myScore != null ? "한 줄 의견 (선택)" : "점수를 먼저 매겨 주세요"
        }
        disabled={busy || myScore == null}
        rows={2}
        className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-ink-3 disabled:opacity-60"
      />

      {/* 다른 담당자 의견 */}
      {loading ? (
        <p className="text-[11px] text-ink-3">불러오는 중…</p>
      ) : others.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-hairline-2 pt-2.5">
          <p className="text-[11px] font-medium text-ink-3">
            다른 담당자 ({others.length})
          </p>
          {others.map((e) => (
            <div key={e.evaluatorId} className="flex items-start gap-2">
              {e.evaluatorAvatar ? (
                <Image
                  src={e.evaluatorAvatar}
                  alt={e.evaluatorName}
                  width={22}
                  height={22}
                  className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ok/15 text-[11px] font-semibold text-ok">
                  {e.score}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[12px]">
                  <span className="font-medium">{e.evaluatorName}</span>
                  <span className="ml-1.5 font-semibold text-ok">{e.score}점</span>
                </p>
                {e.comment ? (
                  <p className="text-[12px] leading-snug text-ink-2">{e.comment}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

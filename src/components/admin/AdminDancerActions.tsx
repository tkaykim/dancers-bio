"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveDancerAction,
  rejectDancerAction,
  setDancerDisplayOrderAction,
} from "@/app/actions/admin-dancers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "pending" | "approved" | "rejected";

/**
 * 댄서 승인/거부/노출순서 액션.
 * ⚠️ 거부 사유 입력은 `window.prompt()`를 쓰지 않는다 — iOS 홈화면(standalone) PWA에서는
 * prompt/alert/confirm 이 표시되지 않고 즉시 null 을 돌려줘 "거부 버튼이 아무 반응 없음"이 된다.
 * 인라인 입력창으로 받는다.
 */
export function AdminDancerActions({
  id,
  status,
  displayOrder,
}: {
  id: string;
  status: Status;
  displayOrder: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [orderValue, setOrderValue] = useState<string>(
    displayOrder == null ? "" : String(displayOrder),
  );

  function approve() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const result = await approveDancerAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function submitReject() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("거부 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", trimmed);
    startTransition(async () => {
      const result = await rejectDancerAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRejectOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function saveOrder() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("display_order", orderValue.trim());
    startTransition(async () => {
      const result = await setDancerDisplayOrderAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-[168px] flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {status !== "approved" ? (
          <Button size="sm" disabled={pending} onClick={approve}>
            {status === "rejected" ? "재승인" : "승인"}
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <Button
            size="sm"
            variant={rejectOpen ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => {
              setError(null);
              setRejectOpen((v) => !v);
            }}
          >
            거부
          </Button>
        ) : null}
      </div>
      {rejectOpen ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitReject();
          }}
        >
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="거부 사유 (사용자에게 표시)"
            maxLength={500}
            autoFocus
            className="h-8 w-44"
          />
          <Button size="sm" variant="destructive" type="submit" disabled={pending}>
            확정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={pending}
            onClick={() => {
              setRejectOpen(false);
              setReason("");
            }}
          >
            취소
          </Button>
        </form>
      ) : null}
      {status === "approved" ? (
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">순서</span>
            <Input
              type="number"
              inputMode="numeric"
              step={1}
              min={-1000}
              max={1000}
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
              placeholder="0"
              className="h-8 w-20"
            />
          </label>
          <Button size="sm" variant="secondary" disabled={pending} onClick={saveOrder}>
            저장
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

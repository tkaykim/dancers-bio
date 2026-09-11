"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveTeamAction, rejectTeamAction } from "@/app/actions/admin-teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "pending" | "approved" | "rejected";

/**
 * 팀 승인/거부 액션.
 * ⚠️ 거부 사유는 `window.prompt()` 대신 인라인 입력창으로 받는다 — iOS 홈화면(standalone)
 * PWA 에서는 prompt 가 표시되지 않아 거부 버튼이 무반응이 된다.
 */
export function AdminTeamActions({
  id,
  status,
}: {
  id: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  function approve() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const result = await approveTeamAction(fd);
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
      const result = await rejectTeamAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRejectOpen(false);
      setReason("");
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
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

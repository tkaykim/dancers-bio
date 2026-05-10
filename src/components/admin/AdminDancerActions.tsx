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

  function reject() {
    const reason = prompt("거부 사유 (사용자에게 표시됩니다)") ?? "";
    if (!reason.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason.trim());
    startTransition(async () => {
      const result = await rejectDancerAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status !== "approved" ? (
          <Button size="sm" disabled={pending} onClick={approve}>
            {status === "rejected" ? "재승인" : "승인"}
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={reject}
          >
            거부
          </Button>
        ) : null}
      </div>
      {status === "approved" ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
              노출 순서
            </span>
            <Input
              type="number"
              inputMode="numeric"
              step={1}
              min={-1000}
              max={1000}
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
              placeholder="0"
              className="h-8 w-24"
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={saveOrder}
          >
            저장
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

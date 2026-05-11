"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveTeamAction, rejectTeamAction } from "@/app/actions/admin-teams";
import { Button } from "@/components/ui/button";

type Status = "pending" | "approved" | "rejected";

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

  function reject() {
    const reason = prompt("거부 사유 (사용자에게 표시됩니다)") ?? "";
    if (!reason.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason.trim());
    startTransition(async () => {
      const result = await rejectTeamAction(fd);
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
          <Button size="sm" variant="outline" disabled={pending} onClick={reject}>
            거부
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

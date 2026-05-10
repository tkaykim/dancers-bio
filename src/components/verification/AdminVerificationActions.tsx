"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveInstagramVerificationAction,
  rejectInstagramVerificationAction,
} from "@/app/actions/verification";
import { Button } from "@/components/ui/button";

export function AdminVerificationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve() {
    if (!confirm("이 인증을 승인합니다. (인스타 DM에서 코드 매칭 확인하셨나요?)"))
      return;
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const result = await approveInstagramVerificationAction(fd);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function reject() {
    const reason = prompt("반려 사유 (사용자에게 표시됨, 선택)") ?? "";
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    if (reason.trim()) fd.set("reason", reason.trim());
    startTransition(async () => {
      const result = await rejectInstagramVerificationAction(fd);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={approve}>
          승인
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={reject}>
          반려
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

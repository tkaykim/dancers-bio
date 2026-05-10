"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToProposalAction } from "@/app/actions/proposals";
import { Button } from "@/components/ui/button";

export function ProposalActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "accepted" | "declined") {
    if (
      !confirm(
        decision === "accepted"
          ? "이 제안을 수락하시겠습니까? 수락 후엔 양쪽이 서로의 연락 정보를 볼 수 있습니다."
          : "이 제안을 거절하시겠습니까?",
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("application_id", applicationId);
    fd.set("decision", decision);
    startTransition(async () => {
      const result = await respondToProposalAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => decide("accepted")}
        >
          수락
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => decide("declined")}
        >
          거절
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

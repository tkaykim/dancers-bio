"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideApplicationAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

export function DecideButtons({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "accepted" | "rejected") {
    if (
      !confirm(
        decision === "accepted" ? "이 지원자를 수락할까요?" : "이 지원자를 거절할까요?",
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("application_id", applicationId);
    fd.set("decision", decision);
    startTransition(async () => {
      const result = await decideApplicationAction(fd);
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
          onClick={() => decide("rejected")}
        >
          거절
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

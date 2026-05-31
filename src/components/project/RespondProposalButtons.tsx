"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToProposalAction } from "@/app/actions/proposals";

export function RespondProposalButtons({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(decision: "accepted" | "declined") {
    setError(null);
    const fd = new FormData();
    fd.set("application_id", applicationId);
    fd.set("decision", decision);
    startTransition(async () => {
      const r = await respondToProposalAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("accepted")}
          disabled={pending}
          className="flex-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "처리 중…" : "수락"}
        </button>
        <button
          type="button"
          onClick={() => respond("declined")}
          disabled={pending}
          className="flex-1 rounded-full border border-hairline-2 px-4 py-2 text-xs font-medium text-ink-2 disabled:opacity-50"
        >
          거절
        </button>
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

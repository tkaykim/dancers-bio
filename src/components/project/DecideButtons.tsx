"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideApplicationAction } from "@/app/actions/applications";
import { closeProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";

type CurrentStatus = "pending" | "accepted" | "rejected" | string;

export function DecideButtons({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  /** 현재 상태에 따라 노출 버튼이 달라짐. accepted/rejected에서 '대기로 되돌리기' 노출. */
  currentStatus: CurrentStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(decision: "accepted" | "rejected" | "pending") {
    const verb =
      decision === "accepted"
        ? "수락"
        : decision === "rejected"
          ? "거절"
          : "대기로 되돌리기";
    if (!confirm(`이 지원을 ${verb}할까요?`)) return;

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
      // Lite: 수락 후 모집 인원이 모두 찼으면 마감 여부 확인.
      if (result.data?.quotaReached && result.data.projectId) {
        const shouldClose = confirm(
          "모집 인원이 모두 찼습니다. 모집을 마감할까요?\n(취소 시 그대로 모집을 계속할 수 있습니다)",
        );
        if (shouldClose) {
          const cfd = new FormData();
          cfd.set("id", result.data.projectId);
          const closeRes = await closeProjectAction(cfd);
          if (!closeRes.ok) {
            setError(closeRes.error);
            // 새로고침은 그래도 수행 (수락은 성공했으니).
          }
        }
      }
      router.refresh();
    });
  }

  const decided = currentStatus === "accepted" || currentStatus === "rejected";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run("accepted")}
        >
          수락
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("rejected")}
        >
          거절
        </Button>
        {decided ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run("pending")}
          >
            대기로 되돌리기
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCanCreateProjectAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";

export function CreatorToggle({
  profileId,
  granted,
}: {
  profileId: string;
  granted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !granted;
    if (
      !confirm(
        next
          ? "이 사용자에게 프로젝트 개설 권한을 부여합니다."
          : "이 사용자의 프로젝트 개설 권한을 회수합니다.",
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("profile_id", profileId);
    fd.set("grant", next ? "true" : "false");
    startTransition(async () => {
      const result = await setCanCreateProjectAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant={granted ? "outline" : "default"}
        disabled={pending}
        onClick={toggle}
      >
        {pending ? "..." : granted ? "권한 회수" : "권한 부여"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

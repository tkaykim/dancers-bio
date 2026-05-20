"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToProjectAction } from "@/app/actions/applications";
import { NEEDS_DANCER_ERROR } from "@/lib/lite-constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Lite: 본인 own dancer 1개로만 지원. dancer 없으면 onboarding 유도.
export function ApplyForm({
  projectId,
  projectShortCode,
  hasDancer,
}: {
  /** UUID — server action에 전달되는 canonical id. */
  projectId: string;
  /** 6자 short_code — returnTo URL 등 외부 노출용. */
  projectShortCode: string;
  hasDancer: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [needsDancer, setNeedsDancer] = useState<boolean>(!hasDancer);
  const [pending, startTransition] = useTransition();

  if (needsDancer) {
    const returnTo = encodeURIComponent(`/projects/${projectShortCode}?apply=1`);
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-ink-2">
          지원하려면 먼저 댄서 프로필이 필요합니다.
        </p>
        <p className="text-xs text-ink-3">
          30초만에 만들 수 있어요. 만들고 나면 이 공고로 자동 복귀합니다.
        </p>
        <a
          href={`/me/portfolio/add?returnTo=${returnTo}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          댄서 프로필 만들기 →
        </a>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setMessage(null);
        formData.set("project_id", projectId);
        startTransition(async () => {
          const result = await applyToProjectAction(formData);
          if (!result.ok) {
            if (result.error === NEEDS_DANCER_ERROR) {
              setNeedsDancer(true);
              return;
            }
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "지원이 완료됐습니다." });
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Label htmlFor="cover_message" className="text-xs uppercase tracking-[0.14em] text-ink-3">
        ↳ 한 줄 자기소개 (선택)
      </Label>
      <textarea
        id="cover_message"
        name="cover_message"
        rows={3}
        maxLength={500}
        placeholder="예: 백업 7년차, K-pop 다수 경험 보유. 빠른 캐치 자신 있어요."
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {message ? (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "지원하는 중..." : "지원하기"}
      </Button>
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("지원을 취소하시겠습니까?")) return;
        const fd = new FormData();
        fd.set("application_id", applicationId);
        startTransition(async () => {
          const { withdrawApplicationAction } = await import("@/app/actions/applications");
          const result = await withdrawApplicationAction(fd);
          if (!result.ok) {
            alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "취소 중..." : "지원 취소"}
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { openProjectThreadAction } from "@/app/actions/messages";

const UI_ENABLED = process.env.NEXT_PUBLIC_MESSAGING_ENABLED === "true";

/**
 * 댄서가 먼저 대화를 시작하는 진입점 — 지원 카드·공고 상세의 「운영팀에 문의」.
 * 지원자 여부는 서버 액션이 판정한다(비지원자는 안내 오류).
 */
export function OpenThreadButton({
  projectId,
  label = "운영팀에 문의",
  className,
}: {
  projectId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  if (!UI_ENABLED) return null;

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
        const result = await openProjectThreadAction({ projectId });
        if (!result.ok) return void toast.error(result.error);
        router.push(`/messages/${result.data!.roomId}`);
        } catch {
          toast.error("대화를 열지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
        } finally {
          setLoading(false);
        }
      }}
      className={
        className ??
        "rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-secondary disabled:opacity-50"
      }
    >
      {loading ? "여는 중…" : label}
    </button>
  );
}

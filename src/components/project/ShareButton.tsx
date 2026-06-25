"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 프로젝트(공고) 공유 버튼.
 * - 모바일·PWA: navigator.share() 네이티브 공유시트(유튜브 공유처럼).
 * - 미지원 브라우저(데스크톱 등): 클립보드 복사 + 토스트로 폴백.
 * 공유 URL은 항상 short_code 경로로 만든다 (UUID 노출 금지).
 */
export function ShareButton({
  shortCode,
  title,
}: {
  shortCode: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/projects/${shortCode}`
        : `/projects/${shortCode}`;

    // 1) 네이티브 공유시트 (모바일·PWA). 사용자가 취소하면 조용히 종료.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // 그 외 오류는 클립보드 폴백으로 진행
      }
    }

    // 2) 폴백: 클립보드 복사
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("링크를 복사했습니다");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="공고 공유"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <Share2 className="size-3.5" />
      )}
      공유
    </button>
  );
}

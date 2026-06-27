"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 프로필·팀 공유 버튼 (재사용).
 * - 모바일·PWA: navigator.share() 네이티브 공유시트 → 카카오톡·인스타 등이 바로 뜸.
 * - 미지원(데스크톱 등): 클립보드 복사 + 토스트로 폴백 → 붙여넣기로 공유.
 * url 은 항상 공식 도메인(dancers.bio / deetz.kr)으로 넘긴다 (호출부에서 canonical 생성).
 */
export function ShareLinkButton({
  url,
  title,
  text,
  label = "공유",
  variant = "pill",
  className = "",
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  variant?: "pill" | "icon" | "block";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // 1) 네이티브 공유시트 (모바일·PWA). 취소 시 조용히 종료.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: text ?? title, url });
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
      toast.success("링크를 복사했어요. 카카오·인스타에 붙여넣어 공유해보세요.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }

  const Icon = copied ? Check : Share2;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleShare}
        aria-label={`${label} 공유`}
        className={
          "flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background/90 " +
          className
        }
      >
        <Icon className="size-[18px]" aria-hidden />
      </button>
    );
  }

  if (variant === "block") {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={
          "flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 " +
          className
        }
      >
        <Icon className="size-4" aria-hidden />
        {copied ? "복사됨" : label}
      </button>
    );
  }

  // variant === "pill"
  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={`${label} 공유`}
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary hover:text-foreground " +
        className
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

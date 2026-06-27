"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { ShareLinkButton } from "@/components/share/ShareLinkButton";

/**
 * 내 프로필 공유 유도 카드 (마이페이지 · 본인 공개 프로필).
 * - 카카오·인스타 공유를 권하는 문구 + 복붙하기 쉬운 URL 노출 + 복사 버튼.
 * - 메인 액션은 네이티브 공유시트(ShareLinkButton, block).
 */
export function ProfileShareCard({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  // 표시는 스킴 없이 깔끔하게 (https:// 제거). 복사는 전체 URL.
  const display = url.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("링크를 복사했어요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="text-sm font-bold text-foreground">📣 내 프로필 공유하기</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">
        카카오톡·인스타그램에 프로필 링크를 공유해보세요.
        <br />
        많이 보일수록 매칭·캐스팅 기회가 늘어납니다.
      </p>

      {/* 복붙용 URL 박스 */}
      <button
        type="button"
        onClick={copy}
        aria-label="프로필 링크 복사"
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">
          {display}
        </span>
        {copied ? (
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <Copy className="size-4 shrink-0 text-ink-3" aria-hidden />
        )}
      </button>

      <div className="mt-3">
        <ShareLinkButton
          url={url}
          title={title}
          text={text}
          label="공유하기"
          variant="block"
        />
      </div>
    </section>
  );
}

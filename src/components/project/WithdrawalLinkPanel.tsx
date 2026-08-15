"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

// 출금신청 단톡방 공유 링크 패널 (일정설문 단톡방 링크와 동일 컨셉).
// 한 링크를 단톡방에 뿌리면, 로그인한 본인 댄서로 해석돼 자기 정산건 출금 신청 화면으로 연결.
// grigoUrl을 넘기면 GRIGO 화이트라벨 도메인 링크 행이 추가된다 (같은 화면, 회사 명의).
export function WithdrawalLinkPanel({
  url,
  grigoUrl,
}: {
  url: string;
  grigoUrl?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedGrigo, setCopiedGrigo] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("출금 신청 링크를 복사했어요.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했어요. 링크를 길게 눌러 복사해 주세요.");
    }
  }

  async function copyGrigo() {
    if (!grigoUrl) return;
    try {
      await navigator.clipboard.writeText(grigoUrl);
      setCopiedGrigo(true);
      toast.success("GRIGO 출금 신청 링크를 복사했어요.");
      setTimeout(() => setCopiedGrigo(false), 1500);
    } catch {
      toast.error("복사에 실패했어요. 링크를 길게 눌러 복사해 주세요.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold">출금 신청 링크 (단톡방 공유)</h3>
        <p className="text-xs text-ink-3">
          이 링크를 단톡방에 공유하면, 합격 댄서가 로그인 후 본인 정산 금액을 확인하고
          출금 신청할 수 있어요. 정산 금액이 등록된 댄서에게만 보입니다.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-ink-2"
        />
        <button
          type="button"
          onClick={copy}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground active:opacity-80"
        >
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {grigoUrl ? (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-ink-3">
            GRIGO 명의 링크 (그리고엔터 소속 프로젝트용)
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={grigoUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-ink-2"
            />
            <button
              type="button"
              onClick={copyGrigo}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-ink-2 active:bg-secondary"
            >
              {copiedGrigo ? (
                <Check size={15} aria-hidden />
              ) : (
                <Copy size={15} aria-hidden />
              )}
              {copiedGrigo ? "복사됨" : "복사"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

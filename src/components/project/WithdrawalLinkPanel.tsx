"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

// 출금신청 단톡방 공유 링크 패널 (일정설문 단톡방 링크와 동일 컨셉).
// 한 링크를 단톡방에 뿌리면, 로그인한 본인 댄서로 해석돼 자기 정산건 출금 신청 화면으로 연결.
export function WithdrawalLinkPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}

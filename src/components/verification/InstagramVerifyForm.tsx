"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Send } from "lucide-react";
import { requestInstagramVerification } from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  code: string;
  handle: string;
  expires_at: string;
} | null;

// Lite: 운영팀 인스타그램 계정.
const OFFICIAL_INSTAGRAM_USERNAME = "dancers.bio";
// Instagram DM 딥링크. ig.me/m/<username> 는 모바일·PC 모두에서 DM 창으로 이동.
const OFFICIAL_DM_URL = `https://ig.me/m/${OFFICIAL_INSTAGRAM_USERNAME}`;

export function InstagramVerifyForm({
  initial,
  claimRequestId = null,
}: {
  initial: Initial;
  claimRequestId?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function copyMessage() {
    if (!data) return;
    const msg = `dancers.bio 본인인증\n@${data.handle}\n코드: ${data.code}`;
    void navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {data ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">
            ↳ 인증 코드
          </p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-primary">
            {data.code}
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            아래 메시지를{" "}
            <span className="font-semibold text-foreground">
              @{OFFICIAL_INSTAGRAM_USERNAME}
            </span>
            로 DM 보내주세요. 관리자가 매칭되는 코드를 확인하고 승인합니다 (보통 1영업일 이내).
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-card p-3 text-xs">
{`dancers.bio 본인인증
@${data.handle}
코드: ${data.code}`}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={copyMessage}
              className="gap-2"
            >
              <Copy size={14} aria-hidden />
              {copied ? "복사됨!" : "메시지 복사"}
            </Button>
            <a
              href={OFFICIAL_DM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Send size={14} aria-hidden />
              인스타그램에서 DM 보내기 →
            </a>
          </div>
          <p className="text-[11px] text-ink-3">
            만료: {new Date(data.expires_at).toLocaleString("ko-KR")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setData(null);
              setError(null);
            }}
          >
            다른 핸들로 다시 시도
          </Button>
        </div>
      ) : (
        <form
          action={(formData) => {
            setError(null);
            if (claimRequestId) formData.set("claim_request_id", claimRequestId);
            startTransition(async () => {
              const result = await requestInstagramVerification(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setData({
                code: result.data!.code,
                handle: result.data!.instagram_handle,
                expires_at: result.data!.expires_at,
              });
              router.refresh();
            });
          }}
          className="flex flex-col gap-3"
        >
          <Label htmlFor="instagram_handle">인스타그램 핸들</Label>
          <Input
            id="instagram_handle"
            name="instagram_handle"
            placeholder="your_handle (@ 빼고)"
            required
            maxLength={30}
            pattern="[a-zA-Z0-9._]{1,30}"
            autoComplete="off"
          />
          <p className="text-xs text-ink-3 leading-relaxed">
            본인의 공개 인스타그램 핸들을 입력하면 6자리 코드를 발급합니다.
            발급된 코드와 본인 핸들을 @{OFFICIAL_INSTAGRAM_USERNAME}로 DM 보내면 관리자가
            매칭 후 인증 처리합니다.
          </p>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} size="lg">
            {pending ? "발급 중..." : "인증 코드 받기"}
          </Button>
        </form>
      )}
    </div>
  );
}

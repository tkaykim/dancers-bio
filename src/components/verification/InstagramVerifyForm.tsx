"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestInstagramVerification } from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  code: string;
  handle: string;
  expires_at: string;
} | null;

const OFFICIAL_INSTAGRAM = "@cuekr_official";

export function InstagramVerifyForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [data, setData] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
              {OFFICIAL_INSTAGRAM}
            </span>
            에 본인의 인스타그램(@{data.handle})에서 DM으로 보내주세요.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-card p-3 text-xs">
{`Cue 본인인증
@${data.handle}
코드: ${data.code}`}
          </pre>
          <p className="text-[11px] text-ink-3">
            관리자가 DM을 확인하고 매칭되는 코드를 발견하면 수동으로 승인합니다 (보통 1영업일 이내).
            만료: {new Date(data.expires_at).toLocaleString("ko-KR")}
          </p>
          <Button
            type="button"
            variant="outline"
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
            placeholder="cuekr (@ 빼고)"
            required
            maxLength={30}
            pattern="[a-zA-Z0-9._]{1,30}"
            autoComplete="off"
          />
          <p className="text-xs text-ink-3 leading-relaxed">
            본인의 공개 인스타그램 핸들을 입력하면 6자리 코드를 발급합니다.
            그 코드와 본인 핸들을 {OFFICIAL_INSTAGRAM}로 DM 보내면, 관리자가
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

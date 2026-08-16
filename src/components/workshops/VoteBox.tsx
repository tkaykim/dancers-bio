"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Flame } from "lucide-react";

import { submitWorkshopDemandAction } from "@/app/actions/workshops";
import { cn } from "@/lib/utils";
import { C } from "./copy";

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

/** 이미 수요를 남긴 카드를 기억해 버튼 상태를 유지한다 (시각 표시용 — 서버 dedup이 정본). */
const VOTED_KEY = "deetz_ws_voted";

function readVoted(): string[] {
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markVoted(artistId: string) {
  try {
    const next = Array.from(new Set([...readVoted(), artistId]));
    localStorage.setItem(VOTED_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 불가 환경 무시 */
  }
}

/**
 * '나도 원해요' 수요 등록.
 * 로그인 상태면 한 번에 등록되고, 아니면 이메일 또는 인스타 아이디를 받아 중복을 막는다.
 */
export function VoteBox({
  artistId,
  isLoggedIn,
  className,
}: {
  artistId: string;
  isLoggedIn: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (readVoted().includes(artistId)) {
      // localStorage는 클라이언트 전용이라 마운트 후 동기화가 불가피.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(true);
    }
  }, [artistId]);

  const submit = (payload: { contactEmail?: string; contactInstagram?: string }) => {
    setError(null);
    startTransition(async () => {
      const res = await submitWorkshopDemandAction({ artistId, ...payload });
      if (res.ok) {
        markVoted(artistId);
        setDone(true);
        setOpen(false);
      } else {
        setError(res.error || "다시 시도해 주세요.");
      }
    });
  };

  if (done) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[13px] font-semibold text-primary",
          className,
        )}
      >
        <Check className="size-3.5" />
        {C.votedLabel}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (isLoggedIn) {
            submit({});
          } else {
            setOpen(true);
          }
        }}
        disabled={pending}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45",
          className,
        )}
      >
        <Flame className="size-3.5" />
        {pending ? "등록 중…" : C.voteCta}
      </button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-hairline-2 bg-secondary/40 p-3", className)}>
      <p className="text-[12px] leading-relaxed text-ink-2">
        <span className="block">진행 소식을 알려드릴 연락 수단이 필요해요.</span>
        <span className="block">이메일 또는 인스타 아이디 중 하나만 남겨주세요.</span>
      </p>
      <input
        type="email"
        inputMode="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="인스타그램 아이디 (@ 없이)"
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        className={inputClass}
      />
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-hairline-2 px-3 py-2 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={() => {
            if (!email.trim() && !instagram.trim()) {
              setError("이메일 또는 인스타그램 아이디를 입력해 주세요.");
              return;
            }
            submit({
              contactEmail: email.trim() || undefined,
              contactInstagram: instagram.trim() || undefined,
            });
          }}
          disabled={pending}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? "등록 중…" : "수요 등록"}
        </button>
      </div>
    </div>
  );
}

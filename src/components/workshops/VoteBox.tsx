"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Flame } from "lucide-react";

import { submitWorkshopDemandAction } from "@/app/actions/workshops";
import { cn } from "@/lib/utils";
import { DEFAULT_COUNTRY_BY_LANG, T, splitSentences, type Lang } from "./copy";
import { ShareInvite } from "./ShareInvite";

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
 * - artistId: 기존 workshop_artists 카드에 투표
 * - nominate: 카드가 아직 없는 대상(deetz 댄서 풀 검색 결과 등) — 서버 nominate 경로가 카드를 만들어 합산한다.
 */
export function VoteBox({
  artistId,
  nominate,
  isLoggedIn,
  lang = "ko",
  className,
}: {
  artistId?: string;
  nominate?: { name: string; instagramHandle: string };
  isLoggedIn: boolean;
  lang?: Lang;
  className?: string;
}) {
  const c = T[lang];
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [wasFirst, setWasFirst] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (artistId && readVoted().includes(artistId)) {
      // localStorage는 클라이언트 전용이라 마운트 후 동기화가 불가피.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(true);
    }
  }, [artistId]);

  const submit = (payload: { contactEmail?: string; contactInstagram?: string }) => {
    setError(null);
    startTransition(async () => {
      // 거주지는 보는 언어로 추정한 기본값 (th=태국/방콕) — 무조건 서울로 적히던 것보다 정확하다.
      const locale = {
        countryCode: DEFAULT_COUNTRY_BY_LANG[lang],
        city: T[lang].fCityDefault,
      };
      const res = await submitWorkshopDemandAction(
        artistId
          ? { artistId, ...locale, ...payload }
          : { artistName: nominate?.name, instagramHandle: nominate?.instagramHandle, ...locale, ...payload },
      );
      if (res.ok) {
        const votedId = artistId ?? res.data?.artistId;
        if (votedId) markVoted(votedId);
        if (res.data?.isFirst) setWasFirst(true);
        setDone(true);
        setOpen(false);
      } else {
        setError(res.error || c.errGeneric);
      }
    });
  };

  if (done) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-center text-[13px] font-semibold text-primary">
          <Check className="size-3.5 shrink-0" />
          {wasFirst ? c.firstVoteNote : c.votedLabel}
        </div>
        <ShareInvite lang={lang} className="w-full" />
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
        {pending ? c.voteSubmitting : c.voteCta}
      </button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-hairline-2 bg-secondary/40 p-3", className)}>
      <p className="text-[12px] leading-relaxed text-ink-2">
        {splitSentences(c.voteContactPrompt).map((s, i) => (
          <span key={i} className="block">
            {s}
          </span>
        ))}
      </p>
      <input
        type="email"
        inputMode="email"
        placeholder={c.voteEmailPh}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder={c.voteInstaPh}
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
          {c.voteClose}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!email.trim() && !instagram.trim()) {
              setError(c.voteNeedContact);
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
          {pending ? c.voteSubmitting : c.voteSubmit}
        </button>
      </div>
    </div>
  );
}

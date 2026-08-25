"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";

import { submitWorkshopDemandAction } from "@/app/actions/workshops";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@/lib/data/countries";
import { cn } from "@/lib/utils";
import { T, splitSentences, type Lang } from "./copy";
import { ShareInvite } from "./ShareInvite";

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

// 국가 선택지 — 오디션/비자 폼과 동일한 COUNTRIES 데이터·SearchableSelect 방식(대표 지시).
const COUNTRY_OPTIONS: SearchableOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.code === "OTHER" ? c.ko : `${c.ko} (${c.en})`,
  keywords: `${c.en} ${c.ko} ${c.code}`,
}));

/**
 * 신규 안무가 제안 폼 — 이름·인스타그램 필수, 거주 국가/도시(기본 KR/서울), 나머지 선택.
 * 검색 우선 플로우의 폴백 — initialName 은 검색어를 이어받는다.
 */
export function NominateForm({
  isLoggedIn,
  lang,
  initialName = "",
}: {
  isLoggedIn: boolean;
  lang: Lang;
  initialName?: string;
}) {
  const c = T[lang];
  const [name, setName] = useState(initialName);
  const [instagram, setInstagram] = useState("");
  const [comment, setComment] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [city, setCity] = useState(c.fCityDefault);
  const [cityTouched, setCityTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [myInstagram, setMyInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { already: boolean }>(null);
  const [pending, startTransition] = useTransition();

  // 언어를 바꾸면 기본 도시 표기도 따라가되, 직접 입력했다면 유지한다.
  const effectiveCity = cityTouched ? city : c.fCityDefault;

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-8 text-center">
        <PartyPopper className="size-8 text-primary" />
        <p className="text-lg font-bold tracking-tight">{done.already ? c.doneAlreadyTitle : c.doneTitle}</p>
        <Lines text={c.doneBody} className="text-[13px] leading-relaxed text-ink-2" />
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <ShareInvite lang={lang} />
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setName("");
              setInstagram("");
              setComment("");
            }}
            className="rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-foreground"
          >
            {c.doneAgain}
          </button>
        </div>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    if (!name.trim() || !instagram.trim()) {
      setError(c.errNeedNameInsta);
      return;
    }
    if (!isLoggedIn && !email.trim() && !myInstagram.trim()) {
      setError(c.errNeedContact);
      return;
    }
    startTransition(async () => {
      const res = await submitWorkshopDemandAction({
        artistName: name,
        instagramHandle: instagram,
        comment: comment.trim() || undefined,
        contactEmail: email.trim() || undefined,
        contactInstagram: myInstagram.trim() || undefined,
        countryCode: country,
        city: effectiveCity.trim() || undefined,
      });
      if (res.ok) {
        setDone({ already: res.data?.already ?? false });
      } else {
        setError(res.error || c.errGeneric);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline-2 bg-card p-5 md:p-6">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            {c.fArtistName} <span className="text-red-500">{c.requiredMark}</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={c.fArtistNamePh}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            {c.fInstagram} <span className="text-red-500">{c.requiredMark}</span>
          </span>
          <input
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder={c.fInstagramPh}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">
          {c.fComment} <span className="font-normal text-ink-4">{c.optionalMark}</span>
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder={c.fCommentPh}
          className={cn(inputClass, "resize-none")}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">{c.fCountry}</span>
          <SearchableSelect
            options={COUNTRY_OPTIONS}
            value={country}
            onChange={setCountry}
            placeholder={c.fCountry}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">{c.fCity}</span>
          <input
            type="text"
            value={effectiveCity}
            onChange={(e) => {
              setCityTouched(true);
              setCity(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <p className="text-[12px] leading-relaxed text-ink-4 md:col-span-2">{c.fLocationNote}</p>
      </div>

      {!isLoggedIn ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">{c.fMyEmail}</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={c.fMyEmailPh}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">{c.fMyInsta}</span>
            <input
              type="text"
              value={myInstagram}
              onChange={(e) => setMyInstagram(e.target.value)}
              placeholder={c.fMyInstaPh}
              className={inputClass}
            />
          </label>
          <Lines text={c.fContactNote} className="text-[12px] leading-relaxed text-ink-4 md:col-span-2" />
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
      >
        {pending ? c.fSubmitting : c.fSubmit}
      </button>
      <Lines text={c.fFreeNote} className="text-center text-[12px] text-ink-4" />
    </div>
  );
}

function Lines({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {splitSentences(text).map((s, i) => (
        <span key={i} className="block">
          {s}
        </span>
      ))}
    </p>
  );
}

"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";

import { submitWorkshopDemandAction } from "@/app/actions/workshops";
import { C, WANT_TYPES, splitSentences } from "./copy";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

/** 신규 안무가 제안 폼 — 이름·인스타그램 필수, 나머지 선택. */
export function NominateForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [wantType, setWantType] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [myInstagram, setMyInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { already: boolean }>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-8 text-center">
        <PartyPopper className="size-8 text-primary" />
        <p className="text-lg font-bold tracking-tight">
          {done.already ? "이미 등록된 수요예요" : "제안이 접수되었습니다"}
        </p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">같은 안무가를 원하는 수요가 모이면 deetz가 섭외를 추진합니다.</span>
          <span className="block">모집이 열리면 남겨주신 연락 수단으로 소식을 전해드릴게요.</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setName("");
            setInstagram("");
            setWantType(null);
            setComment("");
          }}
          className="mt-1 rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-foreground"
        >
          다른 안무가도 제안하기
        </button>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    if (!name.trim() || !instagram.trim()) {
      setError("안무가 이름과 인스타그램을 입력해 주세요.");
      return;
    }
    if (!isLoggedIn && !email.trim() && !myInstagram.trim()) {
      setError("소식을 받을 이메일 또는 인스타그램 아이디를 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await submitWorkshopDemandAction({
        artistName: name,
        instagramHandle: instagram,
        wantType: (wantType as "class" | "workshop" | "camp" | null) ?? undefined,
        comment: comment.trim() || undefined,
        contactEmail: email.trim() || undefined,
        contactInstagram: myInstagram.trim() || undefined,
      });
      if (res.ok) {
        setDone({ already: res.data?.already ?? false });
      } else {
        setError(res.error || "다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline-2 bg-card p-5 md:p-6">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            안무가 이름 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: Kirsten Dodgen"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            인스타그램 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="@handle 또는 프로필 링크"
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">희망 형태 (선택)</span>
        <div className="flex flex-wrap gap-2">
          {WANT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setWantType(wantType === t.value ? null : t.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                wantType === t.value
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-hairline-2 text-ink-2 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">코멘트 (선택)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="어떤 스타일·곡의 클래스를 원하는지 알려주시면 섭외에 도움이 됩니다."
          className={cn(inputClass, "resize-none")}
        />
      </label>

      {!isLoggedIn ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">내 이메일</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="소식 받을 이메일"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">내 인스타그램</span>
            <input
              type="text"
              value={myInstagram}
              onChange={(e) => setMyInstagram(e.target.value)}
              placeholder="@ 없이 아이디만"
              className={inputClass}
            />
          </label>
          <p className="text-[12px] leading-relaxed text-ink-4 md:col-span-2">
            <span className="block">둘 중 하나만 입력하면 됩니다.</span>
            <span className="block">모집 오픈·확정 소식을 전해드리는 용도로만 사용합니다.</span>
          </p>
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
      >
        {pending ? "접수 중…" : C.ctaNominate}
      </button>
      <p className="text-center text-[12px] text-ink-4">
        {splitSentences("제안은 무료입니다. 카드 공개와 섭외 진행은 deetz 운영진이 검토 후 결정합니다.").map((s, i) => (
          <span key={i} className="block">
            {s}
          </span>
        ))}
      </p>
    </div>
  );
}

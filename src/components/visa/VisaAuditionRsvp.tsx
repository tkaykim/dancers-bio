"use client";

import { useState, useTransition } from "react";
import { Check, CircleDollarSign, Loader2, MapPin, Video } from "lucide-react";

import { submitVisaAuditionRsvpAction } from "@/app/actions/visa-audition-rsvp";
import { cn } from "@/lib/utils";

// 오디션 참석 여부 회신.
//
// 현장 참가가 원칙이라 현장을 먼저·크게 두고, 온라인은 "한국에 없거나 입국이 어려운 경우"라는
// 조건을 라벨에 붙여 두 번째로 둔다. 온라인을 고르면 사유를 받는다.
// 응답 후에는 참가비 결제 버튼이 이어서 뜬다 — 회신과 결제를 한 화면에서 끝내기 위해서다.

type Lang = "en" | "ja" | "ko";
type Rsvp = "onsite" | "online" | "unavailable";

type Copy = {
  title: string;
  lead: string;
  onsite: string;
  onsiteHint: string;
  online: string;
  onlineHint: string;
  unavailable: string;
  unavailableHint: string;
  noteLabel: string;
  notePlaceholderOnline: string;
  notePlaceholderUnavailable: string;
  submit: string;
  submitting: string;
  err: string;
  doneOnsite: string;
  doneOnline: string;
  doneUnavailable: string;
  change: string;
  payTitle: string;
  payBody: string;
  payCta: string;
};

const T: Record<Lang, Copy> = {
  en: {
    title: "Can you come to the audition?",
    lead: "We ask everyone to attend in person. Please let us know which applies to you.",
    onsite: "Yes, I will attend in person",
    onsiteHint: "Come to the studio in Seoul on the day.",
    online: "I need to join online",
    onlineHint: "Only if you are not in Korea, or entering Korea is difficult.",
    unavailable: "I cannot make this date",
    unavailableHint: "We will tell you about the next round.",
    noteLabel: "Tell us why",
    notePlaceholderOnline: "Where are you now, and when can you enter Korea?",
    notePlaceholderUnavailable: "One line is enough.",
    submit: "Send my answer",
    submitting: "Sending…",
    err: "Something went wrong. Please try again.",
    doneOnsite: "You are attending in person. See you at the studio.",
    doneOnline: "We received your request to join online. We will send the video link separately.",
    doneUnavailable: "Thank you for telling us. We will let you know about the next round.",
    change: "Change my answer",
    payTitle: "Secure your place",
    payBody: "Your place is confirmed once the attendance fee is paid. It is fully deducted from the program payment.",
    payCta: "Pay the attendance fee",
  },
  ja: {
    title: "オーディションに参加できますか？",
    lead: "オーディションは対面参加を原則としています。当てはまるものをお選びください。",
    onsite: "はい、対面で参加します",
    onsiteHint: "当日ソウルのスタジオにお越しください。",
    online: "オンライン参加を希望します",
    onlineHint: "韓国にいらっしゃらない場合、または入国が難しい場合のみ。",
    unavailable: "この日程は難しいです",
    unavailableHint: "次回の回をご案内します。",
    noteLabel: "理由を教えてください",
    notePlaceholderOnline: "現在どちらにいらっしゃいますか。入国可能な時期も教えてください。",
    notePlaceholderUnavailable: "一行で十分です。",
    submit: "回答を送る",
    submitting: "送信中…",
    err: "エラーが発生しました。もう一度お試しください。",
    doneOnsite: "対面参加で承りました。スタジオでお会いしましょう。",
    doneOnline: "オンライン参加のご希望を承りました。ビデオリンクは別途ご案内します。",
    doneUnavailable: "お知らせいただきありがとうございます。次回の回をご案内します。",
    change: "回答を変更する",
    payTitle: "参加枠を確保する",
    payBody: "参加確定費のお支払いで枠が確保されます。プログラム決済から全額差し引かれます。",
    payCta: "参加確定費を支払う",
  },
  ko: {
    title: "오디션에 참석하실 수 있나요?",
    lead: "오디션은 현장 참가를 원칙으로 합니다. 해당하는 것을 골라주세요.",
    onsite: "네, 현장에서 참석합니다",
    onsiteHint: "당일 서울 스튜디오로 와주세요.",
    online: "온라인 참여를 요청합니다",
    onlineHint: "한국에 계시지 않거나 입국이 어려운 경우에만 해당됩니다.",
    unavailable: "이 날짜는 어렵습니다",
    unavailableHint: "다음 회차를 안내해 드릴게요.",
    noteLabel: "사유를 알려주세요",
    notePlaceholderOnline: "지금 어디에 계신지, 언제 입국이 가능한지 알려주세요.",
    notePlaceholderUnavailable: "한 줄이면 충분해요.",
    submit: "답변 보내기",
    submitting: "보내는 중…",
    err: "오류가 발생했습니다. 다시 시도해 주세요.",
    doneOnsite: "현장 참석으로 접수됐어요. 스튜디오에서 뵙겠습니다.",
    doneOnline: "온라인 참여 요청을 받았습니다. 화상 링크는 따로 안내드릴게요.",
    doneUnavailable: "알려주셔서 감사합니다. 다음 회차를 안내드리겠습니다.",
    change: "답변 바꾸기",
    payTitle: "참가 자리 확보하기",
    payBody: "참가 확정비를 결제하시면 자리가 확보됩니다. 프로그램 결제 금액에서 전액 차감됩니다.",
    payCta: "참가 확정비 결제하기",
  },
};

export function VisaAuditionRsvp({
  lang,
  token,
  initialRsvp,
  paymentUrl,
  feeLabel,
  paid,
}: {
  lang: Lang;
  token: string;
  initialRsvp: string | null;
  /** 참가 확정비 결제 URL (발급된 경우) */
  paymentUrl: string | null;
  feeLabel: string;
  paid: boolean;
}) {
  const t = T[lang];
  const [rsvp, setRsvp] = useState<Rsvp | null>(
    initialRsvp === "onsite" || initialRsvp === "online" || initialRsvp === "unavailable"
      ? initialRsvp
      : null,
  );
  const [choice, setChoice] = useState<Rsvp | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(!initialRsvp);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsNote = choice === "online" || choice === "unavailable";
  const canSubmit = Boolean(choice) && (!needsNote || note.trim().length > 0);

  const submit = () => {
    if (!choice || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await submitVisaAuditionRsvpAction({ token, rsvp: choice, note: note.trim() || null });
      if (res.ok) {
        setRsvp(choice);
        setEditing(false);
      } else {
        setError(res.error || t.err);
      }
    });
  };

  // 응답을 마친 상태 — 무엇을 골랐는지 + (현장·온라인이면) 결제 안내
  if (rsvp && !editing) {
    const doneText =
      rsvp === "onsite" ? t.doneOnsite : rsvp === "online" ? t.doneOnline : t.doneUnavailable;
    return (
      <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="flex items-start gap-1.5 text-[13px] font-semibold text-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {doneText}
        </p>

        {rsvp !== "unavailable" && !paid ? (
          <div className="mt-3 border-t border-primary/20 pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-semibold text-foreground">{t.payTitle}</p>
              <p className="shrink-0 text-lg font-bold tracking-tight text-foreground">{feeLabel}</p>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t.payBody}</p>
            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <CircleDollarSign className="size-4" />
                {t.payCta}
              </a>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setChoice(rsvp);
            setEditing(true);
          }}
          className="mt-3 text-[12px] font-semibold text-primary hover:underline"
        >
          {t.change}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[13px] font-bold text-foreground">{t.title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{t.lead}</p>

      <div className="mt-3 flex flex-col gap-2">
        <Option
          active={choice === "onsite"}
          onClick={() => setChoice("onsite")}
          icon={<MapPin className="size-4" />}
          label={t.onsite}
          hint={t.onsiteHint}
        />
        <Option
          active={choice === "online"}
          onClick={() => setChoice("online")}
          icon={<Video className="size-4" />}
          label={t.online}
          hint={t.onlineHint}
        />
        <Option
          active={choice === "unavailable"}
          onClick={() => setChoice("unavailable")}
          label={t.unavailable}
          hint={t.unavailableHint}
        />
      </div>

      {needsNote ? (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">{t.noteLabel}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={
              choice === "online" ? t.notePlaceholderOnline : t.notePlaceholderUnavailable
            }
            className="w-full resize-y rounded-lg border border-hairline-2 bg-background px-3.5 py-2.5 text-[13px] text-foreground outline-none placeholder:text-ink-4 focus:border-foreground/40"
          />
        </label>
      ) : null}

      {error ? <p className="mt-2 text-[12.5px] text-destructive">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || pending}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? t.submitting : t.submit}
      </button>
    </div>
  );
}

function Option({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors",
        active ? "border-foreground bg-background" : "border-hairline-2 bg-background/60 hover:border-foreground/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-foreground" : "border-hairline-2",
        )}
      >
        {active ? <span className="size-2 rounded-full bg-foreground" /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {icon}
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">{hint}</span>
      </span>
    </button>
  );
}

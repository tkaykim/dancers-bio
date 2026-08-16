"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, CircleAlert, Eye, Loader2, Send } from "lucide-react";

import {
  previewVisaAuditionMailAction,
  sendVisaAuditionMailAction,
} from "@/app/actions/visa-audition";

// 오디션 확정 안내 발송 패널.
// 미팅 안내 패널과 같은 흐름 — 미리보기로 본문을 확인한 뒤 2단계로 발송한다.
// window.confirm 은 쓰지 않는다(자동화 브라우저가 멈춘 사고가 있었다).

type Lang = "ko" | "en" | "ja";

const LANGS: { code: Lang; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
];

export type AuditionMailState = {
  applicationId: string;
  auditionAt: string | null;
  auditionLocation: string | null;
  applicantLang: string | null;
  /** 이미 보낸 안내 (같은 일정으로 중복 발송 방지 표시용) */
  sentAt: string | null;
  sentForAuditionAt: string | null;
};

function formatKst(value: string | null): string {
  if (!value) return "미정";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function VisaAuditionMailPanel({ state }: { state: AuditionMailState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lang, setLang] = useState<Lang>(
    state.applicantLang === "ko" || state.applicantLang === "ja" ? state.applicantLang : "en",
  );
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const hasSchedule = Boolean(state.auditionAt || state.auditionLocation?.trim());
  // 같은 일정으로 이미 보냈는지 — 일정을 바꾸면 다시 보낼 수 있다.
  const currentKey = state.auditionAt ?? (state.auditionLocation ?? "").trim();
  const alreadySent = Boolean(state.sentAt && state.sentForAuditionAt === currentKey);

  const doPreview = () => {
    setError(null);
    setDone(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await previewVisaAuditionMailAction({ applicationId: state.applicationId, lang });
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      if (!res.data) {
        setError("미리보기를 만들지 못했습니다.");
        return;
      }
      setPreview({ subject: res.data.subject, html: res.data.html, to: res.data.to });
    });
  };

  const doSend = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendVisaAuditionMailAction({ applicationId: state.applicationId, lang });
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      setDone(res.data?.sentTo ?? null);
      setPreview(null);
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <CalendarCheck className="h-4 w-4" />
          오디션 확정 안내
        </h4>
        {alreadySent ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            발송함 · {formatKst(state.sentAt)}
          </span>
        ) : hasSchedule ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            발송 대기
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
            일정 미입력
          </span>
        )}
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500">일시</dt>
          <dd className="text-zinc-900">{formatKst(state.auditionAt)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500">장소</dt>
          <dd className="text-zinc-900">{state.auditionLocation?.trim() || "미입력"}</dd>
        </div>
      </dl>

      {!hasSchedule ? (
        <p className="mt-3 text-xs text-zinc-500">
          위 운영 패널에서 오디션 일시나 장소를 저장하면 안내를 보낼 수 있습니다.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">언어</span>
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLang(l.code);
                  setPreview(null);
                  setConfirming(false);
                }}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  lang === l.code
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-500"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={doPreview}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-50"
          >
            {pending && !confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            메일 미리보기
          </button>

          {alreadySent ? (
            <p className="text-xs text-zinc-500">
              같은 일정으로는 이미 안내가 나갔습니다. 일시나 장소를 바꾸면 다시 보낼 수 있습니다.
            </p>
          ) : null}
        </div>
      )}

      {preview ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-600">
            받는 사람 <span className="font-mono text-zinc-900">{preview.to}</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-900">{preview.subject}</p>
          <iframe
            title="오디션 확정 안내 미리보기"
            srcDoc={preview.html}
            sandbox=""
            className="mt-2 h-80 w-full rounded border border-zinc-200 bg-white"
          />
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
            >
              <Send className="h-3.5 w-3.5" />
              이 내용으로 발송
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">정말 발송할까요?</span>
              <button
                type="button"
                onClick={doSend}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                네, 발송합니다
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-500"
              >
                취소
              </button>
            </div>
          )}
        </div>
      ) : null}

      {done ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-emerald-700">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {done} 으로 발송했습니다. 지원자 페이지에도 일정이 표시됩니다.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </section>
  );
}

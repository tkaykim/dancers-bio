"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Eye, Loader2, MousePointerClick, Send } from "lucide-react";
import {
  previewVisaMeetingInviteAction,
  sendVisaMeetingInviteAction,
} from "@/app/actions/visa-meeting";

export type MeetingInvite = {
  id: string;
  meeting_at: string;
  meeting_url: string;
  lang: string;
  subject: string;
  body_html: string;
  status: string;
  error: string | null;
  sent_by_name: string | null;
  created_at: string;
};

export type MeetingTracking = {
  sentCount: number;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  lastEventAt: string | null;
};

const LANGS: { value: "ko" | "en" | "ja"; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

function formatKst(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 수신자가 어디까지 왔는지 한 줄로 요약한다.
function progressLabel(tracking: MeetingTracking | null): string {
  if (!tracking || tracking.sentCount === 0) return "발송 전";
  if (tracking.clickedAt) return "미팅 링크 클릭";
  if (tracking.openedAt) return "메일 열람";
  return "발송 후 미열람";
}

export function VisaMeetingInvitePanel({
  applicationId,
  preferredLang,
  invites,
  tracking,
}: {
  applicationId: string;
  preferredLang: string | null;
  invites: MeetingInvite[];
  tracking: MeetingTracking | null;
}) {
  const router = useRouter();
  const defaultLang = useMemo<"ko" | "en" | "ja">(
    () => (preferredLang === "ko" || preferredLang === "ja" ? preferredLang : "en"),
    [preferredLang],
  );

  const [meetingAtLocal, setMeetingAtLocal] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [lang, setLang] = useState<"ko" | "en" | "ja">(defaultLang);
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedInvite, setOpenedInvite] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runPreview = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await previewVisaMeetingInviteAction({
        applicationId,
        meetingAtLocal,
        meetingUrl,
        lang,
      });
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setPreview({
        subject: result.data!.subject,
        html: result.data!.html,
        to: result.data!.to,
      });
    });
  };

  const runSend = () => {
    if (!window.confirm("이 내용으로 지원자에게 미팅 안내 메일을 발송할까요?")) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendVisaMeetingInviteAction({
        applicationId,
        meetingAtLocal,
        meetingUrl,
        lang,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${result.data!.to} 로 발송했습니다.`);
      setPreview(null);
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-hairline-2 bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <p className="text-xs font-semibold text-ink-3">온라인 미팅 안내 발송</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-ink-3">미팅 일시 (한국시간)</span>
          <input
            type="datetime-local"
            step={900}
            value={meetingAtLocal}
            onChange={(event) => {
              setMeetingAtLocal(event.target.value);
              setPreview(null);
            }}
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-ink-3">메일 언어</span>
          <select
            value={lang}
            onChange={(event) => {
              setLang(event.target.value as "ko" | "en" | "ja");
              setPreview(null);
            }}
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          >
            {LANGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.value === defaultLang ? " (지원자 선택 언어)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[11px] text-ink-3">원격 미팅 링크 (https)</span>
          <input
            value={meetingUrl}
            onChange={(event) => {
              setMeetingUrl(event.target.value);
              setPreview(null);
            }}
            placeholder="https://us05web.zoom.us/j/..."
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || !meetingAtLocal || !meetingUrl}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-hairline-2 bg-background px-3 text-[13px] font-medium hover:bg-secondary disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          메일 초안 보기
        </button>
        <button
          type="button"
          onClick={runSend}
          disabled={pending || !preview}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          title={preview ? "" : "초안을 먼저 확인해 주세요."}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          발송하기
        </button>
      </div>

      {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}
      {message ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-emerald-600">
          <Check className="size-3.5" />
          {message}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[11px] text-ink-3">받는 사람</p>
          <p className="text-[13px] font-semibold text-foreground">{preview.to}</p>
          <p className="mt-2 text-[11px] text-ink-3">제목</p>
          <p className="text-[13px] font-semibold text-foreground">{preview.subject}</p>
          <iframe
            title="메일 초안"
            srcDoc={preview.html}
            sandbox=""
            className="mt-3 h-[460px] w-full rounded-lg border border-hairline-2 bg-white"
          />
        </div>
      ) : null}

      <div className="mt-5 border-t border-hairline-2 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="font-semibold text-ink-3">수신 현황</span>
          <span className="font-semibold text-primary">{progressLabel(tracking)}</span>
          <span className="inline-flex items-center gap-1 text-ink-2">
            <Eye className="size-3.5" />
            열람 {tracking?.openCount ?? 0}회
            {tracking?.openedAt ? ` · ${formatKst(tracking.openedAt)}` : ""}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-2">
            <MousePointerClick className="size-3.5" />
            링크 클릭 {tracking?.clickCount ?? 0}회
            {tracking?.clickedAt ? ` · ${formatKst(tracking.clickedAt)}` : ""}
          </span>
        </div>

        <p className="mt-4 text-[11px] font-semibold text-ink-3">발송 내역 {invites.length}건</p>
        {invites.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-3">아직 발송한 미팅 안내가 없습니다.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {invites.map((invite) => (
              <li key={invite.id} className="rounded-lg border border-hairline-2 bg-background p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span
                    className={
                      invite.status === "sent"
                        ? "rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700"
                        : "rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-700"
                    }
                  >
                    {invite.status === "sent" ? "발송 완료" : "발송 실패"}
                  </span>
                  <span className="text-ink-2">발송 {formatKst(invite.created_at)}</span>
                  <span className="text-ink-2">미팅 {formatKst(invite.meeting_at)}</span>
                  <span className="text-ink-3">{invite.lang}</span>
                  {invite.sent_by_name ? <span className="text-ink-3">by {invite.sent_by_name}</span> : null}
                </div>
                <p className="mt-1 truncate text-[12px] text-ink-3">{invite.meeting_url}</p>
                {invite.error ? <p className="mt-1 text-[12px] text-rose-600">{invite.error}</p> : null}
                <button
                  type="button"
                  onClick={() => setOpenedInvite(openedInvite === invite.id ? null : invite.id)}
                  className="mt-2 text-[12px] text-ink-3 underline underline-offset-2 hover:text-foreground"
                >
                  {openedInvite === invite.id ? "보낸 메일 접기" : "보낸 메일 보기"}
                </button>
                {openedInvite === invite.id ? (
                  <iframe
                    title="보낸 메일"
                    srcDoc={invite.body_html}
                    sandbox=""
                    className="mt-2 h-[420px] w-full rounded-lg border border-hairline-2 bg-white"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  CircleAlert,
  ExternalLink,
  Eye,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Video,
} from "lucide-react";
import {
  checkVisaMeetingCalendarAvailabilityAction,
  previewVisaMeetingInviteAction,
  retryVisaMeetingInviteAction,
  sendVisaMeetingInviteAction,
} from "@/app/actions/visa-meeting";
import { consultationCandidatesFromAnswers } from "@/lib/visa/consultation-slots";

export type MeetingInvite = {
  id: string;
  request_id: string | null;
  meeting_at: string;
  meeting_url: string;
  duration_minutes: number;
  source_slot_local: string | null;
  source_timezone: string | null;
  lang: string;
  subject: string;
  body_html: string;
  status: string;
  error: string | null;
  calendar_status: string;
  calendar_error: string | null;
  google_event_url: string | null;
  sent_by_name: string | null;
  created_at: string;
  mail_sent_at: string | null;
};

export type MeetingTracking = {
  sentCount: number;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  lastEventAt: string | null;
};

type CalendarSchedule = {
  calendarId: string;
  dateKst: string;
  checkedStartIso: string;
  checkedEndIso: string;
  events: Array<{
    id: string;
    summary: string;
    startIso: string;
    endIso: string;
    allDay: boolean;
    eventUrl: string | null;
    conflicts: boolean;
  }>;
  conflictCount: number;
};

const LANGS: { value: "ko" | "en" | "ja"; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const DURATIONS = [30, 45, 60] as const;

function formatKst(value: string | null | undefined): string {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}. ${part("month")}. ${part("day")}. ${part("hour")}:${part("minute")}`;
}

function formatLocal(value: string): string {
  if (!value) return "-";
  return value.replace("T", " ");
}

function formatKstTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
}

function progressLabel(tracking: MeetingTracking | null, sentCount: number): string {
  if (sentCount === 0) return "발송 전";
  if (tracking?.clickedAt) return "미팅 링크 클릭";
  if (tracking?.openedAt) return "메일 열람";
  return "발송 후 미열람";
}

function inviteState(invite: MeetingInvite): {
  label: string;
  className: string;
} {
  if (invite.status === "sent") {
    return {
      label: invite.calendar_status === "created" ? "확정 완료" : "기존 수동 발송",
      className: "bg-emerald-500/10 text-emerald-700",
    };
  }
  if (invite.calendar_status === "created") {
    return { label: "메일 재발송 필요", className: "bg-amber-500/10 text-amber-700" };
  }
  if (invite.calendar_status === "pending") {
    return { label: "Meet 생성 중", className: "bg-sky-500/10 text-sky-700" };
  }
  return { label: "Calendar 생성 실패", className: "bg-rose-500/10 text-rose-700" };
}

export function VisaMeetingInvitePanel({
  applicationId,
  preferredLang,
  consultationAnswers,
  invites,
  tracking,
}: {
  applicationId: string;
  preferredLang: string | null;
  consultationAnswers: Record<string, unknown>;
  invites: MeetingInvite[];
  tracking: MeetingTracking | null;
}) {
  const router = useRouter();
  const defaultLang = useMemo<"ko" | "en" | "ja">(
    () => (preferredLang === "ko" || preferredLang === "ja" ? preferredLang : "en"),
    [preferredLang],
  );
  const candidates = useMemo(
    () => consultationCandidatesFromAnswers(consultationAnswers),
    [consultationAnswers],
  );
  const hasCandidates = candidates.some((candidate) => candidate.sourceLocal);

  const [meetingAtLocal, setMeetingAtLocal] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<(typeof DURATIONS)[number]>(30);
  const [lang, setLang] = useState<"ko" | "en" | "ja">(defaultLang);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [requestId, setRequestId] = useState("");
  const [calendarSchedule, setCalendarSchedule] = useState<CalendarSchedule | null>(null);
  const [calendarCheckKey, setCalendarCheckKey] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedInvite, setOpenedInvite] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retryingInvite, setRetryingInvite] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCandidate =
    selectedCandidateIndex === null ? null : candidates[selectedCandidateIndex] ?? null;
  const sentInvites = invites.filter((invite) => invite.status === "sent").length;
  const sentCount = Math.max(tracking?.sentCount ?? 0, sentInvites);
  const hasLegacySend = sentInvites > (tracking?.sentCount ?? 0);
  const currentCalendarKey = `${meetingAtLocal}|${durationMinutes}`;
  const checkedSchedule = calendarCheckKey === currentCalendarKey ? calendarSchedule : null;

  const resetPreparedRequest = () => {
    setPreview(null);
    setRequestId("");
    setCalendarSchedule(null);
    setCalendarCheckKey("");
    setConfirming(false);
    setMessage(null);
    setError(null);
  };

  const actionInput = () => ({
    applicationId,
    meetingAtLocal,
    durationMinutes,
    lang,
    candidateSlotLocal: selectedCandidate?.sourceLocal || undefined,
    candidateTimezone: selectedCandidate?.timezone || undefined,
  });

  const chooseCandidate = (index: number) => {
    const candidate = candidates[index];
    if (!candidate?.kstLocal) return;
    setSelectedCandidateIndex(index);
    setMeetingAtLocal(candidate.kstLocal);
    resetPreparedRequest();
  };

  const runPreview = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await previewVisaMeetingInviteAction(actionInput());
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setConfirming(false);
      setPreview({
        subject: result.data!.subject,
        html: result.data!.html,
        to: result.data!.to,
      });
    });
  };

  const runCalendarCheck = () => {
    setError(null);
    setMessage(null);
    setPreview(null);
    startTransition(async () => {
      const result = await checkVisaMeetingCalendarAvailabilityAction(actionInput());
      if (!result.ok) {
        setCalendarSchedule(null);
        setCalendarCheckKey("");
        setError(result.error);
        return;
      }
      setCalendarSchedule(result.data!);
      setCalendarCheckKey(currentCalendarKey);
    });
  };

  const runSend = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    setMessage(null);
    const id = requestId || crypto.randomUUID();
    if (!requestId) setRequestId(id);
    startTransition(async () => {
      const result = await sendVisaMeetingInviteAction({ ...actionInput(), requestId: id });
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      setMessage(`${result.data!.to}로 Calendar 초대와 확정 메일을 발송했습니다.`);
      setPreview(null);
      setRequestId("");
      setCalendarSchedule(null);
      setCalendarCheckKey("");
      router.refresh();
    });
  };

  const runRetry = (inviteId: string) => {
    setError(null);
    setMessage(null);
    setRetryingInvite(inviteId);
    startTransition(async () => {
      const result = await retryVisaMeetingInviteAction({ inviteId });
      setRetryingInvite(null);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      setMessage(`${result.data!.to}로 확정 메일을 발송했습니다.`);
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-hairline-2 bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h3 className="text-xs font-semibold text-ink-3">온라인 미팅 확정</h3>
      </div>

      {hasCandidates ? (
        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold text-ink-3">지원자가 제출한 가능시간</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {candidates.map((candidate, index) => {
              const selected = selectedCandidateIndex === index;
              return (
                <button
                  key={`${candidate.sourceLocal}-${index}`}
                  type="button"
                  disabled={!candidate.kstLocal || pending}
                  onClick={() => chooseCandidate(index)}
                  className={
                    selected
                      ? "min-h-[78px] rounded-lg border border-primary bg-primary/10 p-3 text-left"
                      : "min-h-[78px] rounded-lg border border-hairline-2 bg-background p-3 text-left hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  <span className="block text-[11px] text-ink-3">후보 {index + 1} · 한국시간</span>
                  <span className="mt-1 block text-[13px] font-semibold text-foreground">
                    {candidate.kstLocal ? formatLocal(candidate.kstLocal) : "시간대 확인 필요"}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-ink-3">
                    현지 {formatLocal(candidate.sourceLocal)} · {candidate.timezone || "시간대 없음"}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="mt-3 text-[12px] text-ink-3">지원자가 아직 미팅 가능시간을 제출하지 않았습니다.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[11px] text-ink-3">확정 일시 (한국시간)</span>
          <input
            type="datetime-local"
            step={900}
            value={meetingAtLocal}
            onChange={(event) => {
              setMeetingAtLocal(event.target.value);
              setSelectedCandidateIndex(null);
              resetPreparedRequest();
            }}
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-ink-3">미팅 시간</span>
          <select
            value={durationMinutes}
            onChange={(event) => {
              setDurationMinutes(Number(event.target.value) as (typeof DURATIONS)[number]);
              resetPreparedRequest();
            }}
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          >
            {DURATIONS.map((duration) => (
              <option key={duration} value={duration}>{duration}분</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1.5 block text-[11px] text-ink-3">확정 메일 언어</span>
          <select
            value={lang}
            onChange={(event) => {
              setLang(event.target.value as "ko" | "en" | "ja");
              resetPreparedRequest();
            }}
            className="min-h-10 w-full rounded-lg border border-hairline-2 bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
          >
            {LANGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}{option.value === defaultLang ? " (지원자 선택 언어)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
        <Video className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <p>contact@deetz.kr Calendar에 일정과 Meet를 만들고 지원자에게 Google 초대와 deetz 확정 메일을 발송합니다.</p>
      </div>

      {checkedSchedule ? (
        <div className="mt-3 border-y border-hairline-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <p className="text-[12px] font-semibold text-foreground">{checkedSchedule.dateKst} Calendar 현황</p>
            </div>
            {checkedSchedule.conflictCount === 0 ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                <Check className="size-3.5" />겹치는 일정 없음
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700">
                <CircleAlert className="size-3.5" />겹치는 일정 {checkedSchedule.conflictCount}건
              </span>
            )}
          </div>
          {checkedSchedule.events.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-3">이 날짜에 등록된 일정이 없습니다.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hairline-2">
              {checkedSchedule.events.map((event) => (
                <li key={event.id} className="flex min-h-9 items-center gap-2 py-2 text-[12px]">
                  <span className="w-[88px] shrink-0 font-medium text-ink-2">
                    {event.allDay ? "종일" : `${formatKstTime(event.startIso)}-${formatKstTime(event.endIso)}`}
                  </span>
                  <span className={event.conflicts ? "min-w-0 flex-1 truncate font-semibold text-rose-700" : "min-w-0 flex-1 truncate text-foreground"}>
                    {event.summary}
                  </span>
                  {event.conflicts ? <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-700">겹침</span> : null}
                  {event.eventUrl ? (
                    <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" aria-label={`${event.summary} Calendar에서 열기`} className="shrink-0 text-ink-3 hover:text-foreground">
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runCalendarCheck}
          disabled={pending || !meetingAtLocal}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-hairline-2 bg-background px-3 text-[13px] font-medium hover:bg-secondary disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" />}
          Calendar 겹침 확인
        </button>
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || !meetingAtLocal || !checkedSchedule || checkedSchedule.conflictCount > 0}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-hairline-2 bg-background px-3 text-[13px] font-medium hover:bg-secondary disabled:opacity-50"
        >
          {pending && !retryingInvite ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          확정 메일 미리보기
        </button>
        <button
          type="button"
          onClick={runSend}
          disabled={pending || !preview || !checkedSchedule || checkedSchedule.conflictCount > 0}
          className={
            confirming
              ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-50"
              : "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          }
          title={preview ? "" : checkedSchedule ? "확정 메일을 먼저 확인해 주세요." : "Calendar 겹침을 먼저 확인해 주세요."}
        >
          {pending && !retryingInvite ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />}
          {confirming ? "한 번 더 눌러 확정" : "Calendar + Meet 확정"}
        </button>
        {confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-9 rounded-lg px-3 text-[13px] text-ink-3 hover:text-foreground"
          >
            취소
          </button>
        ) : null}
      </div>

      <div aria-live="polite">
        {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}
        {message ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-emerald-600">
            <Check className="size-3.5" />
            {message}
          </p>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-4 border-t border-primary/30 pt-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <span><span className="text-ink-3">받는 사람</span> <strong>{preview.to}</strong></span>
            <span><span className="text-ink-3">제목</span> <strong>{preview.subject}</strong></span>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">Meet 링크는 확정 직전에 생성되므로 미리보기에는 안내 문구로 표시됩니다.</p>
          <iframe
            title="확정 메일 미리보기"
            srcDoc={preview.html}
            sandbox=""
            className="mt-3 h-[460px] w-full rounded-lg border border-hairline-2 bg-white"
          />
        </div>
      ) : null}

      <div className="mt-5 border-t border-hairline-2 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="font-semibold text-ink-3">수신 현황</span>
          <span className="font-semibold text-primary">{progressLabel(tracking, sentCount)}</span>
          <span className="inline-flex items-center gap-1 text-ink-2">
            <Eye className="size-3.5" />
            열람 {tracking?.openCount ?? 0}회{tracking?.openedAt ? ` · ${formatKst(tracking.openedAt)}` : ""}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-2">
            <MousePointerClick className="size-3.5" />
            링크 클릭 {tracking?.clickCount ?? 0}회{tracking?.clickedAt ? ` · ${formatKst(tracking.clickedAt)}` : ""}
          </span>
        </div>

        {hasLegacySend ? (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">기존 수동 발송 건은 Calendar 자동 생성 이전 이력입니다.</p>
        ) : null}

        <p className="mt-4 text-[11px] font-semibold text-ink-3">확정 내역 {invites.length}건</p>
        {invites.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-3">아직 확정한 미팅이 없습니다.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline-2 border-y border-hairline-2">
            {invites.map((invite) => {
              const state = inviteState(invite);
              const canRetry = invite.status !== "sent" && Boolean(invite.request_id);
              return (
                <li key={invite.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${state.className}`}>{state.label}</span>
                    <span className="text-ink-2">확정 {formatKst(invite.mail_sent_at || invite.created_at)}</span>
                    <span className="text-ink-2">미팅 {formatKst(invite.meeting_at)} · {invite.duration_minutes || 30}분</span>
                    <span className="text-ink-3">{invite.lang}</span>
                    {invite.sent_by_name ? <span className="text-ink-3">by {invite.sent_by_name}</span> : null}
                  </div>
                  {invite.source_slot_local && invite.source_timezone ? (
                    <p className="mt-1 text-[11px] text-ink-3">지원자 후보 {formatLocal(invite.source_slot_local)} · {invite.source_timezone}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                    {invite.meeting_url ? (
                      <a href={invite.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        <Video className="size-3.5" />Meet 열기<ExternalLink className="size-3" />
                      </a>
                    ) : null}
                    {invite.google_event_url ? (
                      <a href={invite.google_event_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-foreground">
                        <CalendarCheck className="size-3.5" />Calendar 열기<ExternalLink className="size-3" />
                      </a>
                    ) : null}
                    {invite.body_html ? (
                      <button type="button" onClick={() => setOpenedInvite(openedInvite === invite.id ? null : invite.id)} className="text-ink-3 underline underline-offset-2 hover:text-foreground">
                        {openedInvite === invite.id ? "보낸 메일 접기" : "보낸 메일 보기"}
                      </button>
                    ) : null}
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => runRetry(invite.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline disabled:opacity-50"
                      >
                        {retryingInvite === invite.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        {invite.calendar_status === "created" ? "확정 메일 재발송" : "Calendar + Meet 재시도"}
                      </button>
                    ) : null}
                  </div>
                  {invite.error || invite.calendar_error ? (
                    <p className="mt-1 text-[12px] text-rose-600">{invite.error || invite.calendar_error}</p>
                  ) : null}
                  {openedInvite === invite.id && invite.body_html ? (
                    <iframe title="보낸 확정 메일" srcDoc={invite.body_html} sandbox="" className="mt-2 h-[420px] w-full rounded-lg border border-hairline-2 bg-white" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

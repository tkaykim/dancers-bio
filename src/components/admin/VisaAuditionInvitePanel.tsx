"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, CircleAlert, Eye, Loader2, Send, Users } from "lucide-react";

import {
  listAuditionInviteCandidatesAction,
  previewAuditionInviteAction,
  sendAuditionInvitesAction,
  type AuditionInviteCandidate,
} from "@/app/actions/visa-audition-invite";

// 오디션 회차 일괄 초대.
//
// 흐름: 일시·장소 입력 → 대상 불러오기 → 체크 → 미리보기 → 2단계 확인 → 발송.
// 누구에게 보낼지는 사람이 고른다. 화면은 판단에 필요한 것만 보여준다 —
// 미팅을 마쳤는지, 지금 한국에 있는지(현장 참가 가능성), 같은 회차로 이미 보냈는지.

export function VisaAuditionInvitePanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [startsAt, setStartsAt] = useState("2026-09-16T16:00");
  const [endsAt, setEndsAt] = useState("2026-09-16T18:00");
  const [location, setLocation] = useState("엠아이디(MID) 댄스 스튜디오 · 이대역");

  const [candidates, setCandidates] = useState<AuditionInviteCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number; details: string[] } | null>(null);

  // datetime-local 은 시간대가 없다. 한국 시각으로 입력한다고 보고 +09:00 을 붙인다.
  const iso = (local: string) => (local ? `${local}:00+09:00` : null);
  const eventInput = () => ({
    startsAt: iso(startsAt) ?? "",
    endsAt: iso(endsAt),
    location: location.trim(),
  });

  const load = () => {
    setError(null);
    setResult(null);
    setPreview(null);
    startTransition(async () => {
      const res = await listAuditionInviteCandidatesAction(eventInput());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const list = res.data?.candidates ?? [];
      setCandidates(list);
      // 기본 선택 = 미팅을 마쳤고 아직 이 회차로 안 보낸 사람.
      setSelected(new Set(list.filter((c) => c.meetingDone && !c.alreadyInvited).map((c) => c.id)));
    });
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doPreview = () => {
    const first = candidates?.find((c) => selected.has(c.id));
    if (!first) return;
    setError(null);
    startTransition(async () => {
      const res = await previewAuditionInviteAction({ ...eventInput(), applicationId: first.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data) setPreview({ subject: res.data.subject, html: res.data.html, to: res.data.to });
    });
  };

  const doSend = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendAuditionInvitesAction({
        ...eventInput(),
        applicationIds: [...selected],
      });
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      setResult(res.data ?? null);
      setConfirming(false);
      setPreview(null);
      router.refresh();
    });
  };

  const selectedCount = selected.size;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <CalendarPlus className="h-4 w-4" />
        오디션 회차 일괄 초대
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        한 회차를 여러 지원자에게 안내합니다. 받는 분은 케이스 페이지에서 참석 여부를 고르고 참가비를 결제합니다.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">시작 (KST)</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded-md border border-zinc-300 px-2.5 py-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">종료 (KST)</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded-md border border-zinc-300 px-2.5 py-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">장소</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={300}
            className="rounded-md border border-zinc-300 px-2.5 py-2 text-xs"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={load}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-50"
      >
        {pending && !candidates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
        대상 불러오기
      </button>

      {candidates ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-600">
              후보 {candidates.length}명 · 선택 <b className="text-zinc-900">{selectedCount}</b>명
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setSelected(new Set(candidates.filter((c) => !c.alreadyInvited).map((c) => c.id)))}
                className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 hover:border-zinc-500"
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 hover:border-zinc-500"
              >
                선택 해제
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-zinc-200">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900">{c.name}</span>
                    {c.nationality ? <span className="text-[11px] text-zinc-500">{c.nationality}</span> : null}
                    <span className="rounded border border-zinc-200 px-1 text-[10px] uppercase text-zinc-500">
                      {c.lang}
                    </span>
                    {c.meetingDone ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        미팅 완료
                      </span>
                    ) : null}
                    {c.currentlyInKorea === false ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        해외 거주
                      </span>
                    ) : null}
                    {c.alreadyInvited ? (
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                        이 회차 발송함
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">{c.email}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={doPreview}
            disabled={pending || selectedCount === 0}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            첫 대상으로 미리보기
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-600">
            예시 수신자 <span className="font-mono text-zinc-900">{preview.to}</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-900">{preview.subject}</p>
          <iframe
            title="오디션 초대 미리보기"
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
              선택한 {selectedCount}명에게 발송
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">
                {selectedCount}명에게 실제로 발송합니다. 계속할까요?
              </span>
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

      {result ? (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5" />
            발송 {result.sent}건 · 실패 {result.failed}건 · 건너뜀 {result.skipped}건
          </p>
          {result.details.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {result.details.slice(0, 8).map((d, i) => (
                <li key={i} className="text-[11px] text-emerald-900/80">
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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

"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEventStaffAction,
  removeEventStaffAction,
  searchOpsStaffCandidatesAction,
  updateEventStaffAction,
  type OpsStaffCandidate,
} from "@/app/actions/event-staff";

export type EventStaffMember = {
  id: string;
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
  role: string;
  expires_at: string | null;
};

// timestamptz(ISO) → KST 기준 YYYY-MM-DD (date input 값).
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
}

export function EventStaffPanel({
  eventId,
  opsCode,
  staff,
}: {
  eventId: string;
  opsCode: string;
  staff: EventStaffMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpsStaffCandidate[]>([]);
  const [searching, startSearch] = useTransition();
  const [addExpiry, setAddExpiry] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});

  const existingIds = new Set(staff.map((s) => s.profile_id));

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      if (q.trim().length < 1) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const r = await searchOpsStaffCandidatesAction(q.trim(), eventId);
        if (r.ok && r.data) setResults(r.data);
        else if (!r.ok) setError(r.error);
      });
    },
    [eventId],
  );

  function copyLink() {
    const url = `${window.location.origin}/ops/events/${opsCode}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function add(profileId: string) {
    if (!addExpiry) {
      setError("권한 만료일을 먼저 선택해 주세요.");
      return;
    }
    setError(null);
    setBusyId(profileId);
    const fd = new FormData();
    fd.set("event_id", eventId);
    fd.set("profile_id", profileId);
    fd.set("expires_at", addExpiry);
    addEventStaffAction(fd).then((r) => {
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setQuery("");
      setResults([]);
      router.refresh();
    });
  }

  function saveExpiry(member: EventStaffMember) {
    const next = expiryDraft[member.id] ?? toDateInput(member.expires_at);
    if (!next) {
      setError("만료일을 선택해 주세요.");
      return;
    }
    setError(null);
    setBusyId(member.id);
    const fd = new FormData();
    fd.set("staff_id", member.id);
    fd.set("event_id", eventId);
    fd.set("expires_at", next);
    updateEventStaffAction(fd).then((r) => {
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(member: EventStaffMember) {
    if (!confirm(`${member.display_name} 스태프를 삭제할까요?`)) return;
    setError(null);
    setBusyId(member.id);
    const fd = new FormData();
    fd.set("staff_id", member.id);
    fd.set("event_id", eventId);
    removeEventStaffAction(fd).then((r) => {
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 현장 스태프 ({staff.length})
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-ink-2 hover:bg-secondary/40"
          >
            {copied ? "링크 복사됨 ✓" : "운영보드 링크 복사"}
          </button>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
            >
              + 추가
            </button>
          ) : null}
        </div>
      </div>

      <p className="rounded-lg bg-secondary/30 px-3 py-2 text-[11px] leading-relaxed text-ink-3">
        등록한 분께 위 <b>운영보드 링크</b>를 SNS·이메일로 전달하세요. 받은 분이 본인
        deetz 계정으로 로그인하면 바로 이 운영 콘솔에 접속됩니다.
        <br />
        (deetz 계정이 없으면 먼저 가입이 필요합니다. 지정한 만료일이 지나면 접근이
        자동으로 차단됩니다.)
      </p>

      {staff.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {staff.map((m) => {
            const expired = isExpired(m.expires_at);
            const draft = expiryDraft[m.id] ?? toDateInput(m.expires_at);
            return (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-xl px-2 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                    {m.display_name?.[0] ?? "?"}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <p className="truncate text-sm font-medium">
                      {m.display_name}
                      {expired ? (
                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                          만료됨
                        </span>
                      ) : null}
                    </p>
                    {m.instagram_handle ? (
                      <p className="truncate text-[11px] text-ink-3">
                        @{m.instagram_handle}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-ink-3">만료</span>
                  <input
                    type="date"
                    value={draft}
                    onChange={(e) =>
                      setExpiryDraft((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    aria-label="권한 만료일"
                  />
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => saveExpiry(m)}
                    className="shrink-0 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    {busyId === m.id ? "..." : "저장"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => remove(m)}
                    className="shrink-0 text-[11px] text-ink-3 hover:text-destructive disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">아직 등록된 현장 스태프가 없습니다.</p>
      )}

      {open ? (
        <div className="flex flex-col gap-3 border-t border-hairline-2 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">계정 검색해서 등록</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                setResults([]);
                setError(null);
              }}
              className="text-xs text-ink-3 hover:text-foreground"
            >
              닫기
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink-2">
              권한 만료일 <span className="text-destructive">*</span> (등록 시 필수)
            </span>
            <input
              type="date"
              value={addExpiry}
              onChange={(e) => setAddExpiry(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>

          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="이름 · 전화번호 · 이메일로 검색..."
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3"
          />

          {searching ? (
            <p className="py-3 text-center text-xs text-ink-3">검색 중...</p>
          ) : results.length === 0 && query.trim().length > 0 ? (
            <p className="py-3 text-center text-xs text-ink-3">
              일치하는 계정이 없습니다. (상대가 먼저 deetz 가입을 해야 검색됩니다.)
            </p>
          ) : results.length > 0 ? (
            <ul className="flex max-h-[300px] flex-col gap-1 overflow-y-auto">
              {results.map((c) => {
                const already = existingIds.has(c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                      {c.display_name?.[0] ?? "?"}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-medium">
                        {c.display_name}
                      </p>
                      <p className="truncate text-[11px] text-ink-3">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {already ? (
                      <span className="shrink-0 text-[11px] text-ink-3">등록됨</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === c.id || !addExpiry}
                        title={!addExpiry ? "만료일을 먼저 선택하세요" : undefined}
                        onClick={() => add(c.id)}
                        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
                      >
                        {busyId === c.id ? "..." : "등록"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

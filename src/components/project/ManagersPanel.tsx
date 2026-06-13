"use client";

import Image from "next/image";
import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  addProjectManagerAction,
  removeProjectManagerAction,
  searchManagerCandidatesAction,
  type ManagerCandidate,
} from "@/app/actions/project-managers";

export type ProjectManager = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
};

export function ManagersPanel({
  projectId,
  canEdit,
  managers,
}: {
  projectId: string;
  canEdit: boolean;
  managers: ProjectManager[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ManagerCandidate[]>([]);
  const [searching, startSearch] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingIds = new Set(managers.map((m) => m.profile_id));

  const search = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    startSearch(async () => {
      const r = await searchManagerCandidatesAction(q.trim());
      if (r.ok && r.data) setResults(r.data);
    });
  }, []);

  function add(profileId: string) {
    setError(null);
    setBusyId(profileId);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("profile_id", profileId);
    addProjectManagerAction(fd).then((r) => {
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

  function remove(profileId: string) {
    if (!confirm("이 공동관리자를 삭제할까요?")) return;
    setError(null);
    setBusyId(profileId);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("profile_id", profileId);
    removeProjectManagerAction(fd).then((r) => {
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
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 공동 관리자 ({managers.length})
        </p>
        {canEdit && !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
          >
            + 추가
          </button>
        ) : null}
      </div>

      {managers.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {managers.map((m) => (
            <li
              key={m.profile_id}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5"
            >
              {m.avatar_url ? (
                <Image
                  src={m.avatar_url}
                  alt={m.display_name}
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                  {m.display_name?.[0] ?? "?"}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-sm font-medium">{m.display_name}</p>
                {m.instagram_handle ? (
                  <p className="truncate text-[11px] text-ink-3">
                    @{m.instagram_handle}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={busyId === m.profile_id}
                  onClick={() => remove(m.profile_id)}
                  className="shrink-0 text-[11px] text-ink-3 hover:text-destructive disabled:opacity-50"
                >
                  {busyId === m.profile_id ? "..." : "삭제"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">
          아직 공동 관리자가 없습니다.
          {canEdit ? " 추가하면 함께 지원자를 관리할 수 있어요." : ""}
        </p>
      )}

      {canEdit && open ? (
        <div className="flex flex-col gap-2 border-t border-hairline-2 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">계정 검색해서 추가</p>
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
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="이름 또는 인스타 핸들로 검색..."
            autoFocus
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3"
          />
          {searching ? (
            <p className="py-3 text-center text-xs text-ink-3">검색 중...</p>
          ) : results.length === 0 && query.trim().length > 0 ? (
            <p className="py-3 text-center text-xs text-ink-3">
              결과가 없습니다.
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
                    {c.avatar_url ? (
                      <Image
                        src={c.avatar_url}
                        alt={c.display_name}
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                        {c.display_name?.[0] ?? "?"}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-medium">
                        {c.display_name}
                      </p>
                      {c.instagram_handle ? (
                        <p className="truncate text-[11px] text-ink-3">
                          @{c.instagram_handle}
                        </p>
                      ) : null}
                    </div>
                    {already ? (
                      <span className="shrink-0 text-[11px] text-ink-3">
                        등록됨
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => add(c.id)}
                        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {busyId === c.id ? "..." : "추가"}
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

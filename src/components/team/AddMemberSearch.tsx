"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { addTeamMemberAction } from "@/app/actions/teams";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Hit = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
};

type Props = {
  teamId: string;
};

export function AddMemberSearch({ teamId }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startT] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "search_dancers_for_team_member",
        { p_team_id: teamId, p_term: t, p_limit: 10 },
      );
      if (!error) setHits((data ?? []) as Hit[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [term, teamId]);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">멤버 추가 — 댄서 검색</h2>
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="활동명 또는 한글 이름으로 검색"
        aria-label="댄서 검색"
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">검색 중...</p>
      ) : null}
      {!loading && term.trim().length > 0 && hits.length === 0 ? (
        <p className="text-xs text-muted-foreground">검색 결과가 없습니다.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {hits.map((h) => {
          const isAdding = addingId === h.id && pending;
          return (
            <li
              key={h.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-2"
            >
              {h.profile_img ? (
                <Image
                  src={h.profile_img}
                  alt={h.stage_name}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-secondary" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{h.stage_name}</p>
                {h.korean_name ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {h.korean_name}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  setMessage(null);
                  setAddingId(h.id);
                  const fd = new FormData();
                  fd.set("team_id", teamId);
                  // 폼 필드 이름은 호환을 위해 그대로 'profile_id' — addTeamMemberAction 의
                  // 폴백 분기가 dancer.id 입력을 그대로 수용한다 (actions/teams.ts:267-271).
                  fd.set("profile_id", h.id);
                  startT(async () => {
                    const r = await addTeamMemberAction(fd);
                    setAddingId(null);
                    if (!r.ok) {
                      setMessage({ kind: "error", text: r.error });
                      return;
                    }
                    setMessage({ kind: "ok", text: `${h.stage_name} 추가됨` });
                    setTerm("");
                    setHits([]);
                    router.refresh();
                  });
                }}
              >
                {isAdding ? "추가 중..." : "추가"}
              </Button>
            </li>
          );
        })}
      </ul>
      {message ? (
        <p
          className={
            "rounded-md px-3 py-2 text-xs " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

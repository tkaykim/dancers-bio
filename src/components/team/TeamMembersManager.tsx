"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addTeamMemberAction,
  disbandTeamAction,
  removeTeamMemberAction,
  transferTeamLeadAction,
} from "@/app/actions/teams";
import { AddMemberSearch } from "@/components/team/AddMemberSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TeamMemberRow = {
  id: string;
  dancer_id: string | null;
  dancer_profile_id: string | null;
  display_name: string | null;
  joined_at: string;
  dancer_label: string | null;
  avatar_url: string | null;
  slug: string | null;
};

type Props = {
  teamId: string;
  leadProfileId: string;
  members: TeamMemberRow[];
};

function HighlightAvatar({
  src,
  label,
  isLead,
}: {
  src: string | null;
  label: string;
  isLead: boolean;
}) {
  const ring = isLead
    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
    : "ring-1 ring-border";
  if (src) {
    return (
      <Image
        src={src}
        alt={label}
        width={56}
        height={56}
        className={`h-14 w-14 rounded-full object-cover ${ring}`}
      />
    );
  }
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-base font-semibold ${ring}`}
    >
      {label.slice(0, 1)}
    </div>
  );
}

export function TeamMembersManager({ teamId, leadProfileId, members }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [adding, startAdding] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDisband, setShowDisband] = useState(false);

  const linkedMembers = members.filter(
    (m) => m.dancer_profile_id && m.dancer_profile_id !== leadProfileId,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">현재 멤버</h2>
          <span className="font-mono text-[11px] text-muted-foreground">{members.length}</span>
        </div>
        <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {members.map((m) => {
            const isLead = m.dancer_profile_id === leadProfileId;
            const label = m.dancer_label ?? m.display_name ?? "(이름 없음)";
            const avatar = (
              <HighlightAvatar src={m.avatar_url} label={label} isLead={isLead} />
            );
            return (
              <div
                key={m.id}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <div className="relative">
                  {m.slug ? (
                    <Link
                      href={`/d/${m.slug}`}
                      aria-label={`${label} 프로필 보기`}
                      className="block transition-opacity hover:opacity-80"
                    >
                      {avatar}
                    </Link>
                  ) : (
                    avatar
                  )}
                  {!isLead ? (
                    <button
                      type="button"
                      disabled={removingId === m.id}
                      aria-label={`${label} 제거`}
                      onClick={async () => {
                        if (!confirm(`${label} 님을 팀에서 제거할까요?`)) return;
                        setRemovingId(m.id);
                        setMessage(null);
                        const fd = new FormData();
                        fd.set("member_id", m.id);
                        fd.set("team_id", teamId);
                        const result = await removeTeamMemberAction(fd);
                        setRemovingId(null);
                        if (!result.ok) {
                          setMessage({ kind: "error", text: result.error });
                          return;
                        }
                        router.refresh();
                      }}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-sm leading-none text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <span className="w-full truncate text-center text-xs font-medium">
                  {label}
                </span>
                {isLead ? (
                  <span className="-mt-0.5 text-[10px] font-medium text-primary">리더</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <AddMemberSearch teamId={teamId} />

      <details className="rounded-md border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          가상 멤버 추가 (댄서 프로필 없이 이름만 등록)
        </summary>
        <form
          action={(formData) => {
            formData.set("team_id", teamId);
            setMessage(null);
            startAdding(async () => {
              const result = await addTeamMemberAction(formData);
              if (!result.ok) {
                setMessage({ kind: "error", text: result.error });
                return;
              }
              setMessage({ kind: "ok", text: "멤버가 추가됐습니다." });
              router.refresh();
            });
          }}
          className="mt-3 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">표시 이름</Label>
            <Input
              id="display_name"
              name="display_name"
              maxLength={80}
              placeholder="멤버 이름"
              required
            />
            <p className="text-xs text-muted-foreground">
              플랫폼 계정·댄서 프로필이 없는 멤버를 이름만 등록할 때 사용합니다.
            </p>
          </div>
          <Button type="submit" disabled={adding} className="w-fit">
            {adding ? "추가 중..." : "이름만 등록"}
          </Button>
        </form>
      </details>

      <section className="flex flex-col gap-3 rounded-md border border-warn/30 bg-warn/5 p-4">
        <h2 className="text-sm font-semibold">리더 위임 / 팀 해체</h2>
        <p className="text-xs text-muted-foreground">
          리더를 그만두려면 후임을 지정하거나 팀을 해체해야 합니다.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowTransfer(true);
              setShowDisband(false);
            }}
          >
            리더 위임
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setShowDisband(true);
              setShowTransfer(false);
            }}
          >
            팀 해체
          </Button>
        </div>

        {showTransfer ? (
          <form
            action={async (formData) => {
              formData.set("team_id", teamId);
              setMessage(null);
              const result = await transferTeamLeadAction(formData);
              if (!result.ok) {
                setMessage({ kind: "error", text: result.error });
                return;
              }
              setMessage({ kind: "ok", text: "리더가 위임됐습니다." });
              setShowTransfer(false);
              router.refresh();
              router.push("/me/teams");
            }}
            className="flex flex-col gap-3 rounded-md border border-border bg-background p-3"
          >
            <Label htmlFor="new_lead_profile_id">후임 리더</Label>
            <select
              id="new_lead_profile_id"
              name="new_lead_profile_id"
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— 후임 선택 —</option>
              {linkedMembers.map((m) => (
                <option key={m.id} value={m.dancer_profile_id ?? ""}>
                  {m.dancer_label ?? m.display_name ?? "(이름 없음)"}
                </option>
              ))}
            </select>
            {linkedMembers.length === 0 ? (
              <p className="text-xs text-destructive">
                댄서 프로필이 연결된 다른 멤버가 없습니다. 먼저 댄서 프로필이 있는 멤버를 추가하세요.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={linkedMembers.length === 0}>
                위임 확정
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTransfer(false)}
              >
                취소
              </Button>
            </div>
          </form>
        ) : null}

        {showDisband ? (
          <form
            action={async (formData) => {
              formData.set("team_id", teamId);
              setMessage(null);
              const result = await disbandTeamAction(formData);
              if (!result.ok) {
                setMessage({ kind: "error", text: result.error });
                return;
              }
              setMessage({ kind: "ok", text: "팀이 해체됐습니다." });
              setShowDisband(false);
              router.push("/me/teams");
            }}
            className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <p className="text-sm">
              해체 시 팀이 디렉토리에서 사라지고, 진행 중인 지원·제안 이력은 보관됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="destructive">
                해체 확정
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDisband(false)}
              >
                취소
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      {message ? (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

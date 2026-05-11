"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTeamMemberAction,
  disbandTeamAction,
  removeTeamMemberAction,
  transferTeamLeadAction,
} from "@/app/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TeamMemberRow = {
  id: string;
  profile_id: string | null;
  display_name: string | null;
  joined_at: string;
  profile_display_name: string | null;
};

type Props = {
  teamId: string;
  leadProfileId: string;
  members: TeamMemberRow[];
};

export function TeamMembersManager({ teamId, leadProfileId, members }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [adding, startAdding] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDisband, setShowDisband] = useState(false);

  const linkedMembers = members.filter((m) => m.profile_id && m.profile_id !== leadProfileId);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">현재 멤버</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isLead = m.profile_id === leadProfileId;
            const label =
              m.profile_display_name ?? m.display_name ?? "(이름 없음)";
            return (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.profile_id ? "플랫폼 계정 연결됨" : "이름만 등록"}
                    {isLead ? " · 팀장" : ""}
                  </span>
                </div>
                {!isLead ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removingId === m.id}
                    onClick={async () => {
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
                  >
                    {removingId === m.id ? "제거 중..." : "제거"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">팀장</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">멤버 추가</h2>
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
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile_id">플랫폼 계정 ID (선택)</Label>
            <Input
              id="profile_id"
              name="profile_id"
              placeholder="UUID — 계정이 있는 멤버 연결 (선택)"
            />
            <p className="text-xs text-muted-foreground">
              UUID를 비워두면 아래 이름만 등록됩니다.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">표시 이름</Label>
            <Input
              id="display_name"
              name="display_name"
              maxLength={80}
              placeholder="멤버 이름 (계정 없을 때 필수)"
            />
          </div>
          <Button type="submit" disabled={adding} className="w-fit">
            {adding ? "추가 중..." : "멤버 추가"}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-warn/30 bg-warn/5 p-4">
        <h2 className="text-sm font-semibold">팀장 이양 / 팀 해체</h2>
        <p className="text-xs text-muted-foreground">
          팀장을 떠나려면 후임을 지정하거나 팀을 해체해야 합니다.
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
            팀장 이양
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
              setMessage({ kind: "ok", text: "팀장이 이양됐습니다." });
              setShowTransfer(false);
              router.refresh();
              router.push("/me/teams");
            }}
            className="flex flex-col gap-3 rounded-md border border-border bg-background p-3"
          >
            <Label htmlFor="new_lead_profile_id">후임 팀장</Label>
            <select
              id="new_lead_profile_id"
              name="new_lead_profile_id"
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— 후임 선택 —</option>
              {linkedMembers.map((m) => (
                <option key={m.id} value={m.profile_id ?? ""}>
                  {m.profile_display_name ?? m.display_name ?? "(이름 없음)"}
                </option>
              ))}
            </select>
            {linkedMembers.length === 0 ? (
              <p className="text-xs text-destructive">
                플랫폼 계정이 연결된 다른 멤버가 없습니다. 먼저 계정 연결된 멤버를 추가하세요.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={linkedMembers.length === 0}>
                이양 확정
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

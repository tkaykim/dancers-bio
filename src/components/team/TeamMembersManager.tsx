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
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

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
  const t = useT(portfolio);
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
          <h2 className="text-sm font-semibold">{t("team_members.current_title")}</h2>
          <span className="font-mono text-[11px] text-muted-foreground">{members.length}</span>
        </div>
        <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {members.map((m) => {
            const isLead = m.dancer_profile_id === leadProfileId;
            const label =
              m.dancer_label ?? m.display_name ?? t("team_members.no_name");
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
                      aria-label={t("team_members.aria_view_profile", { name: label })}
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
                      aria-label={t("team_members.aria_remove", { name: label })}
                      onClick={async () => {
                        if (!confirm(t("team_members.confirm_remove", { name: label })))
                          return;
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
                <span className="w-full truncate text-center text-xs font-medium" data-ugc>
                  {label}
                </span>
                {isLead ? (
                  <span className="-mt-0.5 text-[10px] font-medium text-primary">
                    {t("team_members.lead_badge")}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <AddMemberSearch teamId={teamId} />

      <details className="rounded-md border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {t("team_members.virtual_summary")}
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
              setMessage({ kind: "ok", text: t("team_members.added") });
              router.refresh();
            });
          }}
          className="mt-3 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">{t("team_members.display_name_label")}</Label>
            <Input
              id="display_name"
              name="display_name"
              maxLength={80}
              placeholder={t("team_members.display_name_placeholder")}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("team_members.display_name_hint")}
            </p>
          </div>
          <Button type="submit" disabled={adding} className="w-fit">
            {adding ? t("team_members.adding") : t("team_members.add_name_only")}
          </Button>
        </form>
      </details>

      <section className="flex flex-col gap-3 rounded-md border border-warn/30 bg-warn/5 p-4">
        <h2 className="text-sm font-semibold">{t("team_members.danger_title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("team_members.danger_desc")}
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
            {t("team_members.transfer")}
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
            {t("team_members.disband")}
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
              setMessage({ kind: "ok", text: t("team_members.transferred") });
              setShowTransfer(false);
              router.refresh();
              router.push("/me/teams");
            }}
            className="flex flex-col gap-3 rounded-md border border-border bg-background p-3"
          >
            <Label htmlFor="new_lead_profile_id">
              {t("team_members.new_lead_label")}
            </Label>
            <select
              id="new_lead_profile_id"
              name="new_lead_profile_id"
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("team_members.new_lead_placeholder")}</option>
              {linkedMembers.map((m) => (
                <option key={m.id} value={m.dancer_profile_id ?? ""}>
                  {m.dancer_label ?? m.display_name ?? t("team_members.no_name")}
                </option>
              ))}
            </select>
            {linkedMembers.length === 0 ? (
              <p className="text-xs text-destructive">
                {t("team_members.no_linked_members")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={linkedMembers.length === 0}>
                {t("team_members.transfer_confirm")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTransfer(false)}
              >
                {t("team_members.cancel")}
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
              setMessage({ kind: "ok", text: t("team_members.disbanded") });
              setShowDisband(false);
              router.push("/me/teams");
            }}
            className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <p className="text-sm">{t("team_members.disband_warning")}</p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="destructive">
                {t("team_members.disband_confirm")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDisband(false)}
              >
                {t("team_members.cancel")}
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

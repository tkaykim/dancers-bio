"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationPrefsAction } from "@/app/actions/notification-prefs";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import me from "@/lib/i18n/messages/me";

export interface NotificationPrefsInitial {
  email_project_match: boolean;
  email_marketing: boolean;
  push_project_match: boolean;
  email_unsubscribed_all: boolean;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card px-4 py-4 ${
        disabled ? "opacity-50" : "cursor-pointer"
      }`}
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs leading-relaxed text-ink-2">{description}</span>
      </span>
      <span className="relative mt-1 inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full bg-ink-3/40 transition-colors peer-checked:bg-foreground" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function NotificationSettingsForm({ initial }: { initial: NotificationPrefsInitial }) {
  const router = useRouter();
  const t = useT(me);
  const [state, setState] = useState(initial);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailBlocked = state.email_unsubscribed_all;

  function submit() {
    setOk(false);
    setError(null);
    const fd = new FormData();
    fd.set("email_project_match", state.email_project_match ? "true" : "false");
    fd.set("email_marketing", state.email_marketing ? "true" : "false");
    fd.set("push_project_match", state.push_project_match ? "true" : "false");
    fd.set("email_unsubscribed_all", state.email_unsubscribed_all ? "true" : "false");
    startTransition(async () => {
      const res = await updateNotificationPrefsAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          {t("notifications.group_email")}
        </p>
        <ToggleRow
          label={t("notifications.email_project_match_label")}
          description={t("notifications.email_project_match_desc")}
          checked={state.email_project_match && !emailBlocked}
          disabled={emailBlocked}
          onChange={(v) => setState((s) => ({ ...s, email_project_match: v }))}
        />
        <ToggleRow
          label={t("notifications.email_marketing_label")}
          description={t("notifications.email_marketing_desc")}
          checked={state.email_marketing && !emailBlocked}
          disabled={emailBlocked}
          onChange={(v) => setState((s) => ({ ...s, email_marketing: v }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          {t("notifications.group_push")}
        </p>
        <ToggleRow
          label={t("notifications.push_project_match_label")}
          description={t("notifications.push_project_match_desc")}
          checked={state.push_project_match}
          onChange={(v) => setState((s) => ({ ...s, push_project_match: v }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          {t("notifications.group_unsubscribe")}
        </p>
        <ToggleRow
          label={t("notifications.unsubscribe_all_label")}
          description={t("notifications.unsubscribe_all_desc")}
          checked={state.email_unsubscribed_all}
          onChange={(v) => setState((s) => ({ ...s, email_unsubscribed_all: v }))}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {ok && <p className="text-sm text-emerald-600">{t("notifications.saved")}</p>}

      <Button onClick={submit} disabled={pending} className="w-full">
        {pending ? t("notifications.saving") : t("notifications.save")}
      </Button>
    </div>
  );
}

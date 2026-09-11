"use client";

import { useState, useTransition, type ReactElement } from "react";
import { Bug, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitBugReportAction } from "@/app/actions/bug-report";
import { useT } from "@/lib/i18n/provider";
import me from "@/lib/i18n/messages/me";

const SEVERITIES: {
  value: "low" | "normal" | "high" | "critical";
  labelKey: "bug.severity_low" | "bug.severity_normal" | "bug.severity_high" | "bug.severity_critical";
}[] = [
  { value: "low", labelKey: "bug.severity_low" },
  { value: "normal", labelKey: "bug.severity_normal" },
  { value: "high", labelKey: "bug.severity_high" },
  { value: "critical", labelKey: "bug.severity_critical" },
];

/**
 * 버그/고장 신고 다이얼로그. trigger 는 children 으로 주입.
 * /me 페이지의 settings row 가 메인 진입점이며, 필요하면 다른 위치에서도
 * 동일 다이얼로그를 띄울 수 있다.
 */
export function BugReportDialog({ trigger }: { trigger: ReactElement }) {
  const t = useT(me);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [severity, setSeverity] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setEmail("");
    setSeverity("normal");
    setError(null);
    setSent(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogTrigger render={trigger} />

      <DialogContent className="max-w-md">
        {sent ? (
          <div className="flex flex-col gap-3 py-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
              ✓
            </div>
            <DialogTitle className="text-lg">{t("bug.sent_title")}</DialogTitle>
            <p className="text-sm leading-relaxed text-ink-2">
              {t("bug.sent_body_1")}<br />
              {t("bug.sent_body_2")}
            </p>
            <Button variant="outline" className="mt-2" onClick={() => setOpen(false)}>
              {t("bug.close")}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("bug.title")}</DialogTitle>
              <p className="text-xs text-ink-3">{t("bug.desc")}</p>
            </DialogHeader>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await submitBugReportAction({
                    title,
                    description,
                    severity,
                    reporter_email: email,
                    page_url: typeof window !== "undefined" ? window.location.href : "",
                    user_agent:
                      typeof navigator !== "undefined" ? navigator.userAgent : "",
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setSent(true);
                });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bug-title" className="text-xs">{t("bug.field_title")}</Label>
                <Input
                  id="bug-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("bug.field_title_placeholder")}
                  required
                  maxLength={160}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bug-desc" className="text-xs">{t("bug.field_desc")}</Label>
                <textarea
                  id="bug-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("bug.field_desc_placeholder")}
                  required
                  minLength={5}
                  maxLength={4000}
                  rows={5}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <p className="text-[11px] text-ink-3">{t("bug.auto_info_note")}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bug-severity" className="text-xs">{t("bug.field_severity")}</Label>
                  <select
                    id="bug-severity"
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as typeof severity)
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bug-email" className="text-xs">{t("bug.field_email")}</Label>
                  <Input
                    id="bug-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
              </div>

              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("bug.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t("bug.sending") : t("bug.submit")}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * /me 페이지의 settings list 안에서 그대로 끼워 넣을 수 있는 row-style trigger.
 */
export function BugReportRow() {
  const t = useT(me);
  return (
    <li className="border-b border-border last:border-b-0">
      <BugReportDialog
        trigger={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors active:bg-secondary"
          >
            <div className="flex items-center gap-3">
              <Bug size={18} className="text-ink-2" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold text-foreground">
                  {t("bug.row_title")}
                </span>
                <span className="text-xs text-ink-3">{t("bug.row_desc")}</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-ink-3" aria-hidden />
          </button>
        }
      />
    </li>
  );
}

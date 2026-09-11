"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Send } from "lucide-react";
import { requestInstagramVerification } from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale, useT } from "@/lib/i18n/provider";
import { localeTag } from "@/lib/i18n/t";
import applications from "@/lib/i18n/messages/applications";

type Initial = {
  code: string;
  handle: string;
  expires_at: string;
} | null;

// Lite: 운영팀 인스타그램 계정.
const OFFICIAL_INSTAGRAM_USERNAME = "dancers.bio";
const OFFICIAL_INSTAGRAM_ACCOUNT = `@${OFFICIAL_INSTAGRAM_USERNAME}`;
// Instagram DM 딥링크. ig.me/m/<username> 는 모바일·PC 모두에서 DM 창으로 이동.
const OFFICIAL_DM_URL = `https://ig.me/m/${OFFICIAL_INSTAGRAM_USERNAME}`;

/** 문장 안의 한 조각만 강조한다(언어마다 어순이 달라 문장을 조각 키로 쪼개지 않는다). */
function emphasize(text: string, part: string): ReactNode {
  const at = text.indexOf(part);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-semibold text-foreground">{part}</span>
      {text.slice(at + part.length)}
    </>
  );
}

export function InstagramVerifyForm({
  initial,
  claimRequestId = null,
}: {
  initial: Initial;
  claimRequestId?: string | null;
}) {
  const router = useRouter();
  const t = useT(applications);
  const locale = useLocale();
  const [data, setData] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const dmMessage = data
    ? t("verify.dm.message", { handle: data.handle, code: data.code })
    : "";

  function copyMessage() {
    if (!data) return;
    void navigator.clipboard.writeText(dmMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {data ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">
            {t("verify.code.eyebrow")}
          </p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-primary">
            {data.code}
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            {emphasize(
              t("verify.dm.instruction", { account: OFFICIAL_INSTAGRAM_ACCOUNT }),
              OFFICIAL_INSTAGRAM_ACCOUNT,
            )}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-card p-3 text-xs">
            {dmMessage}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={copyMessage}
              className="gap-2"
            >
              <Copy size={14} aria-hidden />
              {copied ? t("verify.copied") : t("verify.copy")}
            </Button>
            <a
              href={OFFICIAL_DM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Send size={14} aria-hidden />
              {t("verify.dm_link")}
            </a>
          </div>
          <p className="text-[11px] text-ink-3">
            {t("verify.expires", {
              date: new Date(data.expires_at).toLocaleString(localeTag(locale)),
            })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setData(null);
              setError(null);
            }}
          >
            {t("verify.retry")}
          </Button>
        </div>
      ) : (
        <form
          action={(formData) => {
            setError(null);
            if (claimRequestId) formData.set("claim_request_id", claimRequestId);
            startTransition(async () => {
              const result = await requestInstagramVerification(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setData({
                code: result.data!.code,
                handle: result.data!.instagram_handle,
                expires_at: result.data!.expires_at,
              });
              router.refresh();
            });
          }}
          className="flex flex-col gap-3"
        >
          <Label htmlFor="instagram_handle">{t("verify.handle_label")}</Label>
          <Input
            id="instagram_handle"
            name="instagram_handle"
            placeholder={t("verify.handle_placeholder")}
            required
            maxLength={30}
            pattern="[a-zA-Z0-9._]{1,30}"
            autoComplete="off"
          />
          <p className="text-xs text-ink-3 leading-relaxed">
            {t("verify.handle_help", { account: OFFICIAL_INSTAGRAM_ACCOUNT })}
          </p>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} size="lg">
            {pending ? t("verify.submitting") : t("verify.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { claimDancerProfileAction } from "@/app/actions/claim";
import { useT, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/t";
import portfolio from "@/lib/i18n/messages/portfolio";

function CreateProfileCard({
  href,
  dancerCount,
}: {
  href: string;
  dancerCount?: number | null;
}) {
  const t = useT(portfolio);
  const locale = useLocale();
  const avatars = [
    // eslint-disable-next-line no-restricted-syntax -- i18n: decorative avatar initials
    { label: "정", cls: "bg-primary/10 text-foreground" },
    // eslint-disable-next-line no-restricted-syntax -- i18n: decorative avatar initials
    { label: "하", cls: "bg-pink-100 text-pink-700" },
    // eslint-disable-next-line no-restricted-syntax -- i18n: decorative avatar initials
    { label: "민", cls: "bg-emerald-100 text-emerald-700" },
  ];
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-hairline-2 bg-card p-5 transition-colors hover:border-primary/30"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {avatars.map((a) => (
            <span
              key={a.label}
              data-i18n-ignore
              className={
                "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-card " +
                a.cls
              }
            >
              {a.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          {dancerCount && dancerCount > 0
            ? t("footer_cta.dancer_count", {
                count: formatNumber(dancerCount, locale),
              })
            : t("footer_cta.dancer_count_empty")}
        </p>
      </div>
      <p className="text-[15px] font-semibold text-foreground">
        {t("footer_cta.create_title")}
      </p>
      <p className="mt-0.5 text-xs text-ink-3">{t("footer_cta.create_desc")}</p>
      <span className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
        {t("footer_cta.create_cta")}
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

type Mode =
  | { kind: "guest" }
  | { kind: "logged"; canClaim: boolean; alreadyRequested: boolean; claimRequestId?: string | null };

export function ProfileFooterCTA({
  dancerId,
  dancerName,
  dancerCount,
  isCuration,
  isOwner,
  mode,
}: {
  dancerId: string;
  dancerName: string;
  dancerCount?: number | null;
  isCuration: boolean;
  isOwner: boolean;
  mode: Mode;
}) {
  const t = useT(portfolio);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [relation, setRelation] = useState<"self" | "manager" | "other">(
    "self",
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  if (isOwner) return null;

  function onSubmit() {
    setResult(null);
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("relation", relation);
    fd.set("message", message);
    startTransition(async () => {
      const r = await claimDancerProfileAction(fd);
      if (r.ok && r.data?.claim_request_id) {
        // Lite: claim 생성 후 즉시 IG 본인 인증으로 이동.
        router.push(`/verify-instagram?claim=${r.data.claim_request_id}`);
        return;
      }
      setResult(r);
    });
  }

  return (
    <section className="mt-6 flex flex-col gap-3 px-6 pb-24">
      {/* Guest CTA */}
      {mode.kind === "guest" ? (
        <>
          <CreateProfileCard href="/signup" dancerCount={dancerCount} />
          {isCuration ? (
            <Link
              href={`/signup?claim=${dancerId}`}
              className="block rounded-2xl border border-hairline-2 bg-card px-5 py-4 text-center"
            >
              <p className="text-sm font-semibold text-foreground">
                {t("claim.cta_title")}
              </p>
              <p className="mt-1 text-xs text-ink-3">{t("claim.cta_desc_guest")}</p>
            </Link>
          ) : null}
        </>
      ) : null}

      {/* Logged-in: claim or generic CTA */}
      {mode.kind === "logged" && isCuration ? (
        mode.alreadyRequested ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl border border-hairline-2 bg-card px-5 py-4 text-center">
              <p className="text-sm font-medium text-ink-2">
                {t("claim.already_title")}
              </p>
              <p className="mt-1 text-xs text-ink-3">{t("claim.already_desc")}</p>
              {mode.claimRequestId ? (
                <Link
                  href={`/verify-instagram?claim=${mode.claimRequestId}`}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground"
                >
                  {t("claim.verify_cta")}
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                onSubmit();
              }}
              disabled={pending}
              className="text-xs text-ink-3 underline underline-offset-4"
            >
              {pending ? t("claim.processing") : t("claim.resubmit")}
            </button>
          </div>
        ) : !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!mode.canClaim}
            className="rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-foreground">
              {t("claim.cta_title")}
            </p>
            <p className="mt-1 text-xs text-ink-3">{t("claim.cta_desc_logged")}</p>
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">
              {t("claim.form_title", { name: dancerName })}
            </p>
            <p className="mt-1 text-xs text-ink-3">{t("claim.form_desc")}</p>
            <fieldset className="mt-4 flex flex-col gap-2">
              <legend className="text-xs font-medium text-ink-2">
                {t("claim.relation_legend")}
              </legend>
              <div className="flex gap-2">
                {(
                  [
                    { v: "self", l: t("claim.relation_self") },
                    { v: "manager", l: t("claim.relation_manager") },
                    { v: "other", l: t("claim.relation_other") },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setRelation(opt.v)}
                    className={
                      "flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (relation === opt.v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-hairline-2 text-ink-3")
                    }
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="mt-3 block text-xs font-medium text-ink-2">
              {t("claim.message_label")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t("claim.message_placeholder")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {result && !result.ok ? (
              <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {result.error}
              </p>
            ) : null}
            {result?.ok ? (
              <p className="mt-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                {t("claim.success")}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-full border border-hairline-2 px-4 py-2 text-xs font-medium"
              >
                {result?.ok ? t("claim.close") : t("claim.cancel")}
              </button>
              {!result?.ok ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={pending}
                  className="flex-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {pending ? t("claim.sending") : t("claim.submit")}
                </button>
              ) : null}
            </div>
          </div>
        )
      ) : null}

      {/* Generic 'create your own' CTA for any logged-in non-owner */}
      {mode.kind === "logged" && !isCuration ? (
        <CreateProfileCard href="/onboarding/create" dancerCount={dancerCount} />
      ) : null}
    </section>
  );
}

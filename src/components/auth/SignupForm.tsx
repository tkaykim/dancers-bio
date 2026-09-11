"use client";

import { useState, useTransition } from "react";
import { EmailTypoHint } from "@/components/ui/EmailTypoHint";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Globe } from "lucide-react";
import { signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InternationalPhoneField } from "@/components/auth/InternationalPhoneField";
import { LocaleProvider, useEnabledLocales, useLocale, useT } from "@/lib/i18n/provider";
import {
  LANGUAGE_LABEL_NEUTRAL,
  LOCALES,
  LOCALE_LABELS,
  type Locale,
} from "@/lib/i18n/locale";
import auth from "@/lib/i18n/messages/auth";

/**
 * 가입 폼. 맨 위 언어 선택이 폼 전체(제목·라벨·안내·오류)를 그 언어로 즉시 다시 그린다.
 * 입력값은 유지되고, 고른 언어는 가입 시 계정(profiles.preferred_lang)과 쿠키에 저장된다
 * (docs/design-i18n-ui.md §3.9). 언어 선택 자체는 어느 UI 언어에서도 읽을 수 있게
 * 언어 중립 표기(LANGUAGE_LABEL_NEUTRAL)와 자기 표기(LOCALE_LABELS)를 쓴다.
 */
export function SignupForm() {
  const current = useLocale();
  const enabled = useEnabledLocales();
  const [lang, setLang] = useState<Locale>(current);
  return (
    <LocaleProvider locale={lang} requested={lang} enabled={enabled}>
      <div lang={lang} className="flex flex-col gap-8">
        <SignupFormInner lang={lang} onLangChange={setLang} />
      </div>
    </LocaleProvider>
  );
}

function SignupFormInner({
  lang,
  onLangChange,
}: {
  lang: Locale;
  onLangChange: (next: Locale) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectRaw = searchParams.get("redirect") ?? searchParams.get("next");
  const redirectParam =
    redirectRaw && redirectRaw.startsWith("/") && !redirectRaw.startsWith("//")
      ? redirectRaw
      : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const t = useT(auth);
  const enabled = useEnabledLocales();
  const options = LOCALES.filter((l) => enabled.includes(l));

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          {t("signup.title")}
        </h1>
        <p className="text-sm text-ink-2">{t("signup.subtitle")}</p>
        <p className="text-sm text-ink-3">{t("signup.lede")}</p>
      </div>

      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await signupAction(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // 회원가입 직후엔 /onboarding/create 로 가서 댄서 프로필 생성. redirect 가
            // 있으면 onboarding 의 기존 returnTo 메커니즘으로 보존해서 그 페이지로 복귀.
            router.push(
              redirectParam
                ? `/onboarding/create?returnTo=${encodeURIComponent(redirectParam)}`
                : "/onboarding/create",
            );
            router.refresh();
          });
        }}
        className="flex flex-col gap-4"
      >
        {options.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            {/* 언어 이름은 자기 표기라 어느 언어 화면에서도 같다 — 스윕의 한글 검사에서 제외 */}
            <legend
              className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground"
              data-i18n-ignore
            >
              <Globe size={14} aria-hidden className="text-ink-3" />
              {LANGUAGE_LABEL_NEUTRAL}
            </legend>
            <div role="radiogroup" aria-label={LANGUAGE_LABEL_NEUTRAL} className="flex flex-wrap gap-2" data-i18n-ignore>
              {options.map((l) => {
                const active = l === lang;
                return (
                  <label
                    key={l}
                    lang={l}
                    data-testid={`signup-lang-${l}`}
                    className={
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-ink-2 hover:bg-secondary")
                    }
                  >
                    <input
                      type="radio"
                      name="preferred_lang"
                      value={l}
                      checked={active}
                      onChange={() => onLangChange(l)}
                      className="sr-only"
                    />
                    {LOCALE_LABELS[l]}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-ink-3">{t("signup.language_hint")}</p>
          </fieldset>
        ) : (
          <input type="hidden" name="preferred_lang" value={lang} />
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">{t("signup.name")}</Label>
          <Input
            id="display_name"
            name="display_name"
            required
            maxLength={50}
            placeholder={t("signup.name_placeholder")}
            autoComplete="name"
          />
        </div>
        <InternationalPhoneField idPrefix="signup" />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("signup.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <EmailTypoHint email={email} onFix={setEmail} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("signup.password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">{t("signup.password_hint")}</p>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("signup.submitting") : t("signup.submit")}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <span className="block">{t("signup.have_account")}</span>
          <Link
            href={
              redirectParam
                ? `/login?redirect=${encodeURIComponent(redirectParam)}`
                : "/login"
            }
            className="mt-1 inline-block font-medium text-foreground underline"
          >
            {t("signup.login_link")}
          </Link>
        </p>
      </form>
    </>
  );
}

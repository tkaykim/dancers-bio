"use client";

import { Suspense, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { setLocaleAction } from "@/app/actions/locale";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locale";
import { useEnabledLocales, useLocale, useT } from "@/lib/i18n/provider";
import nav from "@/lib/i18n/messages/nav";

/** 좁은 자리(사이드바·헤더)용 짧은 표기. 자기 표기 원칙은 유지한다. */
// eslint-disable-next-line no-restricted-syntax -- 언어의 자기 표기(모든 언어에서 동일하게 보임)
const COMPACT_LABELS: Record<Locale, string> = { ko: "한국어", en: "EN", ja: "日本語" };

type Props = {
  /** 지구본 아이콘 표시 여부(사이드바처럼 폭이 143px 남짓이면 끈다) */
  icon?: boolean;
  /** compact = 사이드바·헤더 pill, full = 설정 카드 */
  variant?: "compact" | "full";
  className?: string;
};

/**
 * 언어 전환기 (docs/design-i18n-ui.md §3.8).
 * 서버 액션이 쿠키·프로필을 저장한 뒤 `lang` 파라미터를 뺀 현재 URL 로 redirect 한다.
 * 성공한 redirect 는 Promise rejection 으로 오므로 실패는 반환값으로만 판단한다.
 */
export function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={null}>
      <LanguageSwitcherInner {...props} />
    </Suspense>
  );
}

function LanguageSwitcherInner({ variant = "compact", icon = true, className }: Props) {
  const locale = useLocale();
  const enabled = useEnabledLocales();
  const t = useT(nav);
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = LOCALES.filter((l) => enabled.includes(l));
  if (options.length < 2) return null;

  const currentUrl = searchParams?.size
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const select = (next: Locale) => {
    if (next === locale || pending) return;
    startTransition(async () => {
      const result = await setLocaleAction(next, currentUrl);
      if (result && result.ok === false) {
        toast.error(t("lang.switch_failed"));
      }
    });
  };

  const labels = variant === "full" ? LOCALE_LABELS : COMPACT_LABELS;

  return (
    <div
      role="group"
      aria-label={t("lang.switcher")}
      data-i18n-ignore
      className={
        // pill 은 줄바꿈 금지, 자리가 모자라면 pill 단위로 다음 줄로 내린다(사이드바 143px·320px 헤더).
        "inline-flex flex-wrap items-center gap-1 " + (className ?? "")
      }
    >
      {icon ? <Globe size={14} aria-hidden className="shrink-0 text-ink-3" /> : null}
      {options.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            disabled={pending}
            onClick={() => select(l)}
            className={
              "whitespace-nowrap rounded-full py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-60 " +
              (variant === "full" ? "px-2.5 " : "px-1.5 ") +
              (active
                ? "bg-foreground text-background"
                : "text-ink-3 hover:bg-secondary hover:text-foreground")
            }
          >
            {labels[l]}
          </button>
        );
      })}
    </div>
  );
}

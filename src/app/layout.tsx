import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SessionRefresher } from "@/components/auth/SessionRefresher";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { SitePopup } from "@/components/layout/SitePopup";
import { ErrorReporter } from "@/components/feedback/ErrorReporter";
import { LegacyLocaleMigration } from "@/components/layout/LegacyLocaleMigration";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/i18n/provider";
import { getLocale, getRequestedLocale } from "@/lib/i18n/server";
import { LOCALE_TAGS, enabledLocales } from "@/lib/i18n/locale";
import { translator } from "@/lib/i18n/t";
import meta from "@/lib/i18n/messages/meta";

const fontVariables = {
  "--font-inter": "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  "--font-jetbrains-mono": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as CSSProperties;

// Pretendard Variable(한·영) + Pretendard JP Variable(일본어 글리프).
// JP CSS 는 조건 없이 항상 싣는다 — 루트 레이아웃은 클라이언트 탐색에서 다시 렌더되지 않아
// 언어·경로 조건이 갱신되지 않는다(예: /me(en) → /me/visa(저장 언어 ja)). CSS 는 unicode-range
// 부분 집합이라 글꼴 파일은 일본어 글리프가 실제로 그려질 때만 내려받는다. (docs/design-i18n-ui.md §3.10)
const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css";
const PRETENDARD_JP_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css";

const SITE = "https://deetz.kr";

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const naverSiteVerification = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim();
const verification: Metadata["verification"] =
  googleSiteVerification || naverSiteVerification
    ? {
        ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
        ...(naverSiteVerification
          ? { other: { "naver-site-verification": naverSiteVerification } }
          : {}),
      }
    : undefined;

// 언어별 기본 제목·설명. 홈(page.tsx)의 title.absolute 가 최종 제목을 정하므로 충돌하지 않는다.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = translator(meta, locale);
  return {
    metadataBase: new URL(SITE),
    title: {
      default: t("site.title"),
      template: "%s · deetz",
    },
    description: t("site.description"),
    manifest: "/manifest.json",
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
    verification,
    openGraph: {
      title: t("site.title"),
      description: t("site.description"),
      url: SITE,
      siteName: "deetz",
      type: "website",
      locale: LOCALE_TAGS[locale].replace("-", "_"),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FFFFFF",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // 미들웨어가 정한 언어. 이 호출로 모든 라우트가 요청 시 렌더가 된다(docs/design-i18n-ui.md §3.3).
  const [locale, requested] = await Promise.all([getLocale(), getRequestedLocale()]);
  const t = translator(meta, locale);
  const enabled = [...enabledLocales()];

  // GEO/AEO: schema.org JSON-LD (Organization + WebSite)
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "deetz",
        alternateName: ["디츠", "deetz", "dancers.bio"],
        url: SITE,
        logo: `${SITE}/brand/deetz-logo-black.png`,
        email: "contact@deetz.kr",
        description: t("site.description"),
        areaServed: "KR",
        sameAs: [
          "https://www.instagram.com/deetz.kr/",
          "https://www.youtube.com/@deetzmagazine",
          "https://dancers.bio",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "deetz",
        alternateName: "디츠",
        inLanguage: LOCALE_TAGS[locale],
        publisher: { "@id": `${SITE}/#organization` },
      },
    ],
  };
  return (
    <html
      lang={locale}
      className="h-full"
      style={fontVariables}
    >
      <head>
        <link rel="stylesheet" href={PRETENDARD_CSS} />
        <link rel="stylesheet" href={PRETENDARD_JP_CSS} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LocaleProvider locale={locale} requested={requested} enabled={enabled}>
          <SessionRefresher />
          <ServiceWorkerRegister />
          <InstallPrompt />
          <SitePopup />
          <ErrorReporter />
          <LegacyLocaleMigration />
          {children}
          <GoogleAnalytics />
          <Analytics />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}

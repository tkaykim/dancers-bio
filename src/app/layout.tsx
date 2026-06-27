import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionRefresher } from "@/components/auth/SessionRefresher";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { ErrorReporter } from "@/components/feedback/ErrorReporter";
import { Toaster } from "@/components/ui/sonner";

const fontVariables = {
  "--font-inter": "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  "--font-jetbrains-mono": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as CSSProperties;

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

export const metadata: Metadata = {
  metadataBase: new URL("https://deetz.kr"),
  title: {
    default: "deetz | 댄서 섭외·안무 제작 플랫폼",
    template: "%s · deetz",
  },
  description:
    "MV·광고·무대·방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  verification,
  openGraph: {
    title: "deetz | 댄서 섭외·안무 제작 플랫폼",
    description:
      "MV·광고·무대·방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
    url: "https://deetz.kr",
    siteName: "deetz",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // GEO/AEO: schema.org JSON-LD (Organization + WebSite)
  const SITE = "https://deetz.kr";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "deetz",
        alternateName: ["디츠", "deetz", "dancers.bio"],
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        email: "dancers.bio.kr@gmail.com",
        description: "MV·광고·무대·방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
        areaServed: "KR",
        sameAs: [
          "https://www.instagram.com/deetz_magazine/",
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
        inLanguage: "ko-KR",
        publisher: { "@id": `${SITE}/#organization` },
      },
    ],
  };
  return (
    <html
      lang="ko"
      className="h-full"
      style={fontVariables}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SessionRefresher />
        <ServiceWorkerRegister />
        <InstallPrompt />
        <ErrorReporter />
        {children}
        <GoogleAnalytics />
        <Toaster />
      </body>
    </html>
  );
}

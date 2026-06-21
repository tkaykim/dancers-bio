import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionRefresher } from "@/components/auth/SessionRefresher";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { ErrorReporter } from "@/components/feedback/ErrorReporter";
import { Toaster } from "@/components/ui/sonner";

const fontVariables = {
  "--font-inter": "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  "--font-jetbrains-mono": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as CSSProperties;

export const metadata: Metadata = {
  metadataBase: new URL("https://deetz.kr"),
  title: {
    default: "deetz | 댄서 섭외·안무 제작 플랫폼",
    template: "%s · deetz",
  },
  description:
    "MV, 광고, 무대, 방송, 행사에 필요한 댄서 섭외, 안무 제작, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외를 연결하는 플랫폼.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "deetz | 댄서 섭외·안무 제작 플랫폼",
    description:
      "MV, 광고, 무대, 방송, 행사에 필요한 댄서 섭외, 안무 제작, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외를 연결하는 플랫폼.",
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
        alternateName: "dancers.bio",
        url: SITE,
        email: "dancers.bio.kr@gmail.com",
        description: "MV, 광고, 무대, 방송, 행사에 필요한 댄서 섭외, 안무 제작, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외를 연결하는 플랫폼.",
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
        <ErrorReporter />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

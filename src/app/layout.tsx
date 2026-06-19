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
  metadataBase: new URL("https://dancers.bio"),
  title: {
    default: "deetz — 댄서 매거진 & 캐스팅 플랫폼",
    template: "%s · deetz",
  },
  description: "댄서를 소개하는 매거진이자, 포트폴리오와 일을 잇는 캐스팅 플랫폼.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "deetz — 댄서 매거진 & 캐스팅 플랫폼",
    description: "댄서를 소개하는 매거진이자, 포트폴리오와 일을 잇는 캐스팅 플랫폼.",
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
  const SITE = "https://dancers.bio";
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
        description: "댄서를 소개하는 매거진이자 포트폴리오와 일을 잇는 캐스팅 플랫폼.",
        areaServed: "KR",
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

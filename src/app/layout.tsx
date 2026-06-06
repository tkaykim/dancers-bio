import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionRefresher } from "@/components/auth/SessionRefresher";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { ErrorReporter } from "@/components/feedback/ErrorReporter";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
  children: React.ReactNode;
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
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
      </body>
    </html>
  );
}

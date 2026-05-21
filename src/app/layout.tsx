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
  title: {
    default: "dancers.bio — 댄서 캐스팅 플랫폼",
    template: "%s · dancers.bio",
  },
  description: "댄서들을 위한 캐스팅 플랫폼. 본인의 포트폴리오를 관리하고, 프로젝트에 지원하세요.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "dancers.bio — 댄서 캐스팅 플랫폼",
    description: "댄서들을 위한 캐스팅 플랫폼. 본인의 포트폴리오를 관리하고, 프로젝트에 지원하세요.",
    siteName: "dancers.bio",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0E0E0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

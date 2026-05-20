import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionRefresher } from "@/components/auth/SessionRefresher";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { BugReportFab } from "@/components/feedback/BugReportFab";
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
  title: "Cue — Dancers Platform",
  description:
    "K-pop 댄스 신을 위한 캐스팅·포트폴리오·프로젝트 매니지먼트 플랫폼",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
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
        <BugReportFab />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileCheck, GraduationCap, Stamp } from "lucide-react";

export const metadata: Metadata = {
  title: "Dance in Korea — E-6-1 visa support | deetz",
  description:
    "Want to work as a dancer in Korea? You need an E-6-1 (Arts & Entertainment) visa. deetz helps you assess your case, prepare the right documents, and support your application.",
  alternates: { canonical: "/visa" },
};

const STEPS = [
  {
    icon: FileCheck,
    title: "Tell us about you",
    body: "A short questionnaire — your nationality, visa status, dance experience, and timing.",
  },
  {
    icon: GraduationCap,
    title: "Get a clear plan",
    body: "We review your case and guide the training, documents, and steps you'll need.",
  },
  {
    icon: Stamp,
    title: "Apply with support",
    body: "deetz helps you prepare and submit your E-6-1 visa application.",
  },
];

export default function VisaLandingPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-16 pt-6">
      <div className="mb-10 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">deetz</span>
        <span className="text-xs text-ink-3">EN · 日本語 · 한국어</span>
      </div>

      <h1 className="text-3xl font-bold leading-tight tracking-tight">
        Dance in Korea,
        <br />
        the right way.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
        To work as a professional dancer in Korea, you need an{" "}
        <span className="font-medium text-foreground">E-6-1 (Arts &amp; Entertainment)</span> visa.
        deetz helps you prepare — from assessing your case to guiding documents and supporting your
        application.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-3">
        한국에서 댄서로 활동하려면 E-6-1(예술흥행) 비자가 필요해요. 韓国でダンサーとして活動するにはE-6-1ビザが必要です。
      </p>

      <div className="mt-9 flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <s.icon className="size-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {i + 1}. {s.title}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/visa/apply"
        className="mt-9 flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Check your visa options — free
        <ArrowRight className="size-4" />
      </Link>

      <p className="mt-5 text-center text-xs leading-relaxed text-ink-4">
        This is preparation and application support, not legal advice. Visa approval is decided by
        Korea Immigration.
      </p>
    </div>
  );
}

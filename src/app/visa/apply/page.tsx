import type { Metadata } from "next";
import { VisaApplyWizard } from "@/components/visa/VisaApplyWizard";

export const metadata: Metadata = {
  title: "Apply — E-6-1 visa support | deetz",
  description: "Tell us about your dance background and visa status so deetz can help you prepare.",
  robots: { index: false, follow: false },
};

type Lang = "en" | "ja" | "ko";

export default async function VisaApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; src?: string }>;
}) {
  const { lang, src } = await searchParams;
  const initialLang: Lang = lang === "ja" || lang === "ko" ? lang : "en";
  const source = src === "program" ? "program" : "visa";
  return <VisaApplyWizard initialLang={initialLang} source={source} />;
}

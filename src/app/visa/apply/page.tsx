import type { Metadata } from "next";
import { VisaApplyWizard } from "@/components/visa/VisaApplyWizard";
import { getRequestedLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Apply — E-6-1 visa support | deetz",
  description: "Tell us about your dance background and visa status so deetz can help you prepare.",
  robots: { index: false, follow: false },
};

export default async function VisaApplyPage({
  searchParams,
}: {
  // `lang` 은 미들웨어가 요청 언어로 바꿔 주므로 여기서 직접 읽지 않는다.
  searchParams: Promise<{ lang?: string; src?: string }>;
}) {
  const [{ src }, initialLang] = await Promise.all([searchParams, getRequestedLocale()]);
  const source = src === "program" ? "program" : "visa";
  return <VisaApplyWizard initialLang={initialLang} source={source} />;
}

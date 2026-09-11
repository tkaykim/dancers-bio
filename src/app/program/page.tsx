import type { Metadata } from "next";
import { ProgramLanding } from "@/components/program/ProgramLanding";
import { getRequestedLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "K-DEBUT — dance, visa & your debut in Korea | deetz × GRIGO",
  description:
    "K-DEBUT: one program from training to your first paid job in Korea. Dance training with pro academies and choreographers, Korean language, industry education, E-6-1 visa support, housing guidance, and real castings through the deetz agency pool. By deetz × GRIGO Entertainment.",
  alternates: { canonical: "/program" },
};

export default async function ProgramPage({
  searchParams,
}: {
  // `lang` 은 미들웨어가 요청 언어로 바꿔 주므로 여기서 직접 읽지 않는다.
  searchParams: Promise<{ lang?: string; embed?: string }>;
}) {
  const [{ embed }, initialLang] = await Promise.all([searchParams, getRequestedLocale()]);
  return <ProgramLanding initialLang={initialLang} embed={embed === "1"} />;
}

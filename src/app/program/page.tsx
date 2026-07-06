import type { Metadata } from "next";
import { ProgramLanding } from "@/components/program/ProgramLanding";

export const metadata: Metadata = {
  title: "K-DEBUT — dance, visa & your debut in Korea | deetz × GRIGO",
  description:
    "K-DEBUT: one program from training to your first paid job in Korea. Dance training with pro academies and choreographers, Korean language, industry education, E-6-1 visa support, housing guidance, and real castings through the deetz agency pool. By deetz × GRIGO Entertainment.",
  alternates: { canonical: "/program" },
};

type Lang = "en" | "ja" | "ko";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; embed?: string }>;
}) {
  const { lang, embed } = await searchParams;
  const explicit = lang === "ja" || lang === "ko" || lang === "en";
  const initialLang: Lang = lang === "ja" || lang === "ko" ? lang : "en";
  return <ProgramLanding initialLang={initialLang} lockLang={explicit} embed={embed === "1"} />;
}

import type { Metadata } from "next";
import { ProgramLanding } from "@/components/program/ProgramLanding";

export const metadata: Metadata = {
  title: "Dance Career in Korea — training, visa & real work | deetz × GRIGO",
  description:
    "One program from training to your first paid job in Korea: dance training, Korean language, industry education, E-6-1 visa support, and real work through the deetz agency pool. By deetz × GRIGO Entertainment.",
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

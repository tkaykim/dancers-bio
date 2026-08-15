import type { Metadata } from "next";
import { listVillagePhotos } from "@/app/actions/village-photos";
import { VillageLanding, type VillagePhoto } from "@/components/village/VillageLanding";

export const metadata: Metadata = {
  title: "deetz Village by GRIGO Entertainment — a dancer house in Seoul, without key money",
  description:
    "deetz Village by GRIGO Entertainment: a dormitory-style dancer house we are preparing in Gangseo-gu, Seoul, for dancers coming from abroad. No 10–20 million KRW deposit — prepay about three months of rent instead. Practice mirrors, beds, food basics, laundry and meal-box on request. Join the waitlist while we check demand.",
  alternates: { canonical: "/village" },
};

type Lang = "en" | "ja" | "ko";

export default async function VillagePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const explicit = lang === "ja" || lang === "ko" || lang === "en";
  const initialLang: Lang = lang === "ja" || lang === "ko" ? lang : "en";

  const rows = await listVillagePhotos();
  const photos: VillagePhoto[] = rows.map((r) => ({
    id: r.id,
    optionKey: (r.option_key === "b" ? "b" : r.option_key === "common" ? "common" : "a") as VillagePhoto["optionKey"],
    url: r.public_url,
    caption: r.caption,
  }));

  return <VillageLanding initialLang={initialLang} lockLang={explicit} photos={photos} />;
}

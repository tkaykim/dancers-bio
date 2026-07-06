import { redirect } from "next/navigation";

// 2026-07-06 대표 결정: 비자 단독 랜딩과 K-DEBUT 프로그램 랜딩의 퍼널을 /program 하나로 통일.
// 지원서(/visa/apply)는 그대로 두고, 이 랜딩으로 오던 기존 공유 링크는 /program으로 보낸다.
// 비자만 필요한 케이스는 같은 지원서 데이터(실력·거주 상태·계획)를 바탕으로 상담에서 트랙을 조정.
export default async function VisaLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const suffix = lang === "ja" || lang === "ko" || lang === "en" ? `?lang=${lang}` : "";
  redirect(`/program${suffix}`);
}

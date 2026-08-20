import type { Metadata } from "next";
import { VisaNextSteps } from "@/components/visa/VisaNextSteps";

// 레벨테스트 통과자에게만 링크로 보내는 비공개 안내 페이지.
// 지금은 내용이 모두 같아 공통 페이지 하나로 둔다 — 결제를 붙여 개인별 금액이
// 필요해지면 그때 토큰 링크(/visa/next/<token>)로 올린다.
//
// 검색 비노출: 여기 noindex + robots.ts 의 /visa/next 차단 두 겹.
// 열람 모니터링은 사이트 공통 GA4(G-MSGPD7E1CR) 페이지뷰로 본다.
export const metadata: Metadata = {
  title: "Next steps | deetz",
  robots: { index: false, follow: false },
};

export default async function VisaNextStepsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const query = await searchParams;
  const lang = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  return <VisaNextSteps preferredLang={lang ?? null} />;
}

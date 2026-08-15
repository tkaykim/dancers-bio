import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  GRIGO_SETTLE_ORIGIN,
  getBrandFromHost,
  type Brand,
} from "@/lib/brand";

// 현재 요청 호스트의 브랜드. request-time API(headers)라 호출한 세그먼트는
// dynamic rendering으로 opt-in된다 — 댄서 대면 정산·인증 페이지에서만 쓸 것.
// (루트 layout·정적 페이지에 넣지 말 것: 전체가 request-time 렌더링으로 강제됨)
export async function getBrand(): Promise<Brand> {
  const h = await headers();
  return getBrandFromHost(h.get("host"));
}

// GRIGO 호스트에서만 탭 제목·공유 카드를 덮고 검색 노출을 막는다.
// 루트 layout의 title template("… | deetz")이 새는 것을 막으려면 absolute가 필요하고,
// og/twitter도 함께 덮지 않으면 카카오톡·메신저 링크 미리보기에 deetz 카드가 뜬다.
// deetz 호스트에서는 빈 객체를 반환해 기존 메타데이터를 그대로 상속한다.
export async function brandMetadata(grigoTitle: string): Promise<Metadata> {
  const brand = await getBrand();
  if (brand !== "grigo") return {};
  const description = "그리고엔터테인먼트 프로젝트 정산 시스템";
  const image = {
    url: `${GRIGO_SETTLE_ORIGIN}/brand/grigo-og.png`,
    width: 1200,
    height: 630,
    alt: "GRIGO ENT",
  };
  return {
    title: { absolute: grigoTitle },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: grigoTitle,
      description,
      siteName: "GRIGO ENT",
      url: GRIGO_SETTLE_ORIGIN,
      images: [image],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: grigoTitle,
      description,
      images: [image],
    },
  };
}

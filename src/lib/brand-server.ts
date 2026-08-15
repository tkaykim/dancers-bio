import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBrandFromHost, type Brand } from "@/lib/brand";

// 현재 요청 호스트의 브랜드. request-time API(headers)라 호출한 세그먼트는
// dynamic rendering으로 opt-in된다 — 댄서 대면 정산·인증 페이지에서만 쓸 것.
// (루트 layout·정적 페이지에 넣지 말 것: 전체가 request-time 렌더링으로 강제됨)
export async function getBrand(): Promise<Brand> {
  const h = await headers();
  return getBrandFromHost(h.get("host"));
}

// GRIGO 호스트에서만 탭 제목을 덮고 검색 노출을 막는다.
// 루트 layout의 title template("… | deetz")이 새는 것을 막으려면 absolute가 필요하다.
// deetz 호스트에서는 빈 객체를 반환해 기존 메타데이터를 그대로 상속한다.
export async function brandMetadata(grigoTitle: string): Promise<Metadata> {
  const brand = await getBrand();
  if (brand !== "grigo") return {};
  return {
    title: { absolute: grigoTitle },
    robots: { index: false, follow: false },
  };
}

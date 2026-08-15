import "server-only";
import { headers } from "next/headers";
import { getBrandFromHost, type Brand } from "@/lib/brand";

// 현재 요청 호스트의 브랜드. request-time API(headers)라 호출한 세그먼트는
// dynamic rendering으로 opt-in된다 — 댄서 대면 정산·인증 페이지에서만 쓸 것.
// (루트 layout·정적 페이지에 넣지 말 것: 전체가 request-time 렌더링으로 강제됨)
export async function getBrand(): Promise<Brand> {
  const h = await headers();
  return getBrandFromHost(h.get("host"));
}

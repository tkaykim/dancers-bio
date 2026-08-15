// 화이트라벨 브랜드 결정 — 클라이언트/서버 공용 순수 로직.
// deetz 앱 하나가 여러 도메인을 서빙하며, GRIGO 정산 호스트로 들어오면
// 댄서 대면 정산 경로(수집·출금·인증)가 GRIGO 브랜딩으로 렌더링된다.
// 서버 컴포넌트에서 현재 요청의 브랜드가 필요하면 brand-server.ts의 getBrand()를 쓴다.

export type Brand = "deetz" | "grigo";

// 운영 GRIGO 정산 호스트. 로컬 검증은 grigo.localhost(포트 무관)로 접속한다.
export const GRIGO_SETTLE_HOST =
  process.env.NEXT_PUBLIC_GRIGO_SETTLE_HOST ?? "settle.grigoent.co.kr";

export const GRIGO_SETTLE_ORIGIN = `https://${GRIGO_SETTLE_HOST}`;

export function getBrandFromHost(host: string | null | undefined): Brand {
  if (!host) return "deetz";
  const h = host.toLowerCase().split(":")[0];
  if (h === GRIGO_SETTLE_HOST || h === "grigo.localhost") return "grigo";
  return "deetz";
}

export type BrandMeta = {
  /** UI 짧은 표기 (로고 옆·푸터) */
  name: string;
  /** 법인/조직 풀네임 (안내 문구) */
  orgName: string;
  /** 이 브랜드로 공유 링크를 만들 때 쓰는 origin */
  origin: string;
};

export const BRAND_META: Record<Brand, BrandMeta> = {
  deetz: {
    name: "deetz",
    orgName: "deetz",
    origin: process.env.NEXT_PUBLIC_SITE_URL ?? "https://deetz.kr",
  },
  grigo: {
    name: "GRIGO ENT",
    orgName: "그리고엔터테인먼트",
    origin: GRIGO_SETTLE_ORIGIN,
  },
};

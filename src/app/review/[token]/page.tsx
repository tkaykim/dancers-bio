import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCastingBoardByReviewToken } from "@/lib/casting/board-data";
import { shareDescriptionOf, shareTitleOf } from "@/lib/casting/board-meta";
import { CastingBoardView } from "@/components/casting/CastingBoardView";

export const dynamic = "force-dynamic";

// 페이지가 openGraph 를 직접 내보내면 루트의 파일 기반 opengraph-image 가 합쳐지지 않는다(운영 실측).
// 사이트 전역 썸네일(2단 로고 카드)을 명시적으로 지정한다.
const SITE_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "deetz" };

const loadBoard = cache(getCastingBoardByReviewToken);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const board = token ? await loadBoard(token) : null;
  const title = shareTitleOf(board, "클라이언트 검토 보드");
  const description = shareDescriptionOf();
  const fullTitle = `${title} · deetz`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: fullTitle,
      description,
      siteName: "deetz",
      type: "website",
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SITE_OG_IMAGE.url] },
  };
}

export default async function CastingReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const board = await loadBoard(token);
  if (!board) notFound();

  return <CastingBoardView board={board} reviewToken={token} />;
}

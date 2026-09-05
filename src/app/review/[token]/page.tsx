import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCastingBoardByReviewToken } from "@/lib/casting/board-data";
import {
  CASTING_BOARD_OG_IMAGE,
  shareDescriptionOf,
  shareTitleOf,
} from "@/lib/casting/board-meta";
import { CastingBoardView } from "@/components/casting/CastingBoardView";

export const dynamic = "force-dynamic";

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
      images: [CASTING_BOARD_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [CASTING_BOARD_OG_IMAGE.url],
    },
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

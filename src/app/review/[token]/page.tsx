import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCastingBoardByReviewToken } from "@/lib/casting/board-data";
import { CastingBoardView } from "@/components/casting/CastingBoardView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function CastingReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const board = await getCastingBoardByReviewToken(token);
  if (!board) notFound();

  return <CastingBoardView board={board} reviewToken={token} />;
}

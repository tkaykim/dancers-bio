import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCastingBoardByCode } from "@/lib/casting/board-data";
import { CastingBoardView } from "@/components/casting/CastingBoardView";
import { canManageProject } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// 클라이언트 공유용 캐스팅 보드. /cast/<share_code> — 로그인 불필요, 읽기 전용.
// 안전 필드만 노출(전화 제외), 사진 없는 인원·필터·정렬은 보드 설정에 따름.
export const metadata: Metadata = {
  robots: { index: false, follow: false }, // 검색엔진 비노출
};

export default async function CastingBoardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const board = await getCastingBoardByCode(code);
  if (!board) notFound();

  // 로그인한 관리자/매니저면 인라인 공지 편집 노출(클라이언트에겐 비노출).
  const canManage = await canManageProject(board.projectId);

  return <CastingBoardView board={board} canManage={canManage} />;
}

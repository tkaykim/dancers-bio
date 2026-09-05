import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCastingBoardByCode } from "@/lib/casting/board-data";
import { shareDescriptionOf, shareTitleOf } from "@/lib/casting/board-meta";
import { CastingBoardView } from "@/components/casting/CastingBoardView";
import { canManageProject } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// 페이지가 openGraph 를 직접 내보내면 루트의 파일 기반 opengraph-image 가 합쳐지지 않는다(운영 실측).
// 사이트 전역 썸네일(2단 로고 카드)을 명시적으로 지정한다.
const SITE_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "deetz" };

// 같은 요청 안에서 generateMetadata 와 페이지가 보드를 두 번 읽지 않도록 캐시한다.
const loadBoard = cache(getCastingBoardByCode);

// 클라이언트 공유용 캐스팅 보드. /cast/<share_code> — 로그인 불필요, 읽기 전용.
// 안전 필드만 노출(전화 제외), 사진 없는 인원·필터·정렬은 보드 설정에 따름.
// 카카오톡·슬랙 미리보기에 보드 제목이 보이도록 OG 메타를 보드별로 만든다. 검색엔진 비노출은 유지.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const board = code ? await loadBoard(code) : null;
  const title = shareTitleOf(board);
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
      url: `https://deetz.kr/cast/${code}`,
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SITE_OG_IMAGE.url] },
  };
}

export default async function CastingBoardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const board = await loadBoard(code);
  if (!board) notFound();

  // 로그인한 관리자/매니저면 인라인 공지 편집 노출(클라이언트에겐 비노출).
  const canManage = await canManageProject(board.projectId);

  return <CastingBoardView board={board} canManage={canManage} />;
}

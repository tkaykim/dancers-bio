import type { BoardView } from "@/lib/casting/board-data";

// 공유 링크 미리보기(OG)용 제목·설명. 금액·아티스트명·연락처는 절대 넣지 않는다.
export function shareTitleOf(board: BoardView | null, fallback = "캐스팅 보드"): string {
  const short = board?.settings.shareTitle?.trim();
  if (short) return short;
  const title = board?.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

// 카카오톡·슬랙이 페이지의 임의 이미지(헤더 로고)를 집어가지 않도록 전용 OG 이미지를 고정한다.
export const CASTING_BOARD_OG_IMAGE = {
  url: "https://deetz.kr/og/casting-board.png",
  width: 1200,
  height: 630,
  alt: "deetz casting board",
} as const;

export function shareDescriptionOf(): string {
  // 인원 수는 계속 바뀌므로 미리보기 설명에는 넣지 않는다(대표 지시).
  return "deetz 캐스팅보드";
}

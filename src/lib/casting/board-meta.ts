import type { BoardView } from "@/lib/casting/board-data";

// 공유 링크 미리보기(OG)용 제목·설명. 금액·아티스트명·연락처는 절대 넣지 않는다.
export function shareTitleOf(board: BoardView | null, fallback = "캐스팅 보드"): string {
  const short = board?.settings.shareTitle?.trim();
  if (short) return short;
  const title = board?.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

// 썸네일은 사이트 전역 opengraph-image(정식 2단 로고 카드)를 그대로 쓴다. 보드별 이미지는 두지 않는다.

export function shareDescriptionOf(): string {
  // 인원 수는 계속 바뀌므로 미리보기 설명에는 넣지 않는다(대표 지시).
  return "deetz 캐스팅보드";
}

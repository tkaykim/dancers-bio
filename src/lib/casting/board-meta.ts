import type { BoardView } from "@/lib/casting/board-data";
import { LINEUP_STATUS_LABEL } from "@/lib/casting/forecast";

// 공유 링크 미리보기(OG)용 제목·설명. 금액·아티스트명·연락처는 절대 넣지 않는다.
export function shareTitleOf(board: BoardView | null, fallback = "캐스팅 보드"): string {
  const title = board?.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function shareDescriptionOf(board: BoardView | null): string {
  const base = "deetz 캐스팅 검토 전용 보드";
  if (!board) return base;
  if (board.forecast) {
    const { counts, settings } = board.forecast;
    const parts = [`${LINEUP_STATUS_LABEL.confirmed} ${counts.confirmed}명`];
    const candidates = counts.negotiating + counts.proposed;
    if (candidates > 0) parts.push(`${settings.candidateLabel} ${candidates}명`);
    return `${base} · ${parts.join(" · ")}`;
  }
  return `${base} · 총 ${board.counts.total}명`;
}

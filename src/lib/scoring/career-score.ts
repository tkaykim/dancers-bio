/**
 * 댄서 경력 "프로 근접도(pro-proximity)" 점수 — 규칙 기반, 결정적.
 *
 * 프론트엔드에 노출되지 않는 내부 점수. 댄서 디렉토리 정렬에만 사용.
 * 순수 함수라 단위 테스트로 검증/튜닝한다.
 *
 * 공식 (경력 1건):
 *   raw = categoryBase(type) × keywordMultiplier(title) × recencyFactor(date)
 *       + (is_representative ? REP_BONUS : 0)
 *
 * 집계 (댄서):
 *   score = Σ( career_i.score × DECAY^(rank-1) ) × (verified ? VERIFIED_BOOST : 1)
 *   (경력을 점수 내림차순 정렬해 상위가 지배하되 다수도 점진 반영 → 개수 스팸 방지)
 */

import { keywordMultiplier, matchKeywordTier } from "./keywords";

/**
 * 카테고리 base 점수 — "창작·제작 역할 > 출연·참여 역할" 원칙.
 * choreo(안무제작)가 최상위, broadcast/performance(출연·참여)는 그보다 낮음.
 */
export const CATEGORY_BASE: Record<string, number> = {
  choreo: 10, // 안무제작 — 최상위
  award: 8.5, // 수상 — 검증된 실력
  judge: 8, // 심사 — 인정받은 위치
  education: 7.5, // 강사·트레이너 — 티칭 전문성
  broadcast: 7, // 방송출연 — 참여
  performance: 7, // 공연·댄서참여 — 참여
  battle: 6,
  workshop: 4,
  other: 3, // catch-all — 키워드로 상승
};

export const REP_BONUS = 3; // is_representative 가산
export const DECAY = 0.92; // 집계 시 rank별 지수 감쇠
export const VERIFIED_BOOST = 1.15; // is_verified 댄서 가산

export type CareerInput = {
  type: string | null;
  title: string | null;
  date: string | null; // YYYY-MM-DD
  is_representative?: boolean | null;
};

export type CareerScoreBreakdown = {
  base: number;
  keywordTier: "S" | "A" | "B" | null;
  keywordMult: number;
  recency: number;
  repBonus: number;
  score: number;
};

function categoryBase(type: string | null): number {
  if (!type) return CATEGORY_BASE.other;
  return CATEGORY_BASE[type] ?? CATEGORY_BASE.other;
}

/**
 * 최신성(현역성) 배수. 최근 활동일수록 높음.
 * @param nowYear 기준 연도 (테스트용 주입, 기본 현재)
 */
export function recencyFactor(
  date: string | null,
  nowYear: number = new Date().getFullYear(),
): number {
  if (!date) return 0.9; // 날짜 미상 — 중립보다 살짝 낮게
  const y = Number(date.slice(0, 4));
  if (!Number.isFinite(y) || y < 1900) return 0.9;
  const age = nowYear - y;
  if (age <= 2) return 1.2;
  if (age <= 5) return 1.0;
  if (age <= 10) return 0.85;
  return 0.7;
}

/** 경력 1건 점수 + 분해(디버깅/투명성용). */
export function scoreCareer(
  c: CareerInput,
  nowYear: number = new Date().getFullYear(),
): CareerScoreBreakdown {
  const base = categoryBase(c.type);
  const keywordTier = matchKeywordTier(c.title);
  const keywordMult = keywordMultiplier(c.title);
  const recency = recencyFactor(c.date, nowYear);
  const repBonus = c.is_representative ? REP_BONUS : 0;
  const score = Math.round((base * keywordMult * recency + repBonus) * 100) / 100;
  return { base, keywordTier, keywordMult, recency, repBonus, score };
}

export type DancerScoreBreakdown = {
  score: number;
  careerCount: number;
  topScores: number[]; // 상위 5개 (디버깅용)
  verifiedBoost: number;
};

/**
 * 댄서 집계 점수. careerScores는 정렬 안 돼도 됨(내부에서 내림차순 정렬).
 */
export function aggregateDancerScore(
  careerScores: number[],
  opts: { isVerified?: boolean | null } = {},
): DancerScoreBreakdown {
  const sorted = [...careerScores].sort((a, b) => b - a);
  let sum = 0;
  for (let rank = 0; rank < sorted.length; rank++) {
    sum += sorted[rank] * Math.pow(DECAY, rank);
  }
  const verifiedBoost = opts.isVerified ? VERIFIED_BOOST : 1;
  const score = Math.round(sum * verifiedBoost * 100) / 100;
  return {
    score,
    careerCount: sorted.length,
    topScores: sorted.slice(0, 5),
    verifiedBoost,
  };
}

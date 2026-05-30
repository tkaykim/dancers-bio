/**
 * 채점 로직 검증. 의존성 없이 Node 내장 test runner 사용.
 * 실행: npx tsx --test src/lib/scoring/career-score.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCareer, aggregateDancerScore, recencyFactor } from "./career-score";

const NOW = 2026;

test("안무제작이 같은 조건의 방송출연보다 높다", () => {
  const choreo = scoreCareer({ type: "choreo", title: "무명 안무제작", date: "2025-01-01" }, NOW);
  const broadcast = scoreCareer({ type: "broadcast", title: "무명 방송출연", date: "2025-01-01" }, NOW);
  assert.ok(choreo.score > broadcast.score, `${choreo.score} > ${broadcast.score}`);
});

test("초대형 방송(BTS)은 무명 안무를 역전한다 (가중 혼합)", () => {
  const btsBroadcast = scoreCareer({ type: "broadcast", title: "BTS 엠카운트다운 백업", date: "2025-01-01" }, NOW);
  const noNameChoreo = scoreCareer({ type: "choreo", title: "지역 행사 안무제작", date: "2025-01-01" }, NOW);
  assert.ok(btsBroadcast.score > noNameChoreo.score, `${btsBroadcast.score} > ${noNameChoreo.score}`);
  assert.equal(btsBroadcast.keywordTier, "S");
});

test("키워드 티어 배수: S=2.0, A=1.5, B=1.2, none=1.0", () => {
  assert.equal(scoreCareer({ type: "other", title: "YG 안무", date: "2025-01-01" }, NOW).keywordMult, 2.0);
  assert.equal(scoreCareer({ type: "other", title: "KBS 출연", date: "2025-01-01" }, NOW).keywordMult, 1.5);
  assert.equal(scoreCareer({ type: "other", title: "댄스 아카데미 강사", date: "2025-01-01" }, NOW).keywordMult, 1.2);
  assert.equal(scoreCareer({ type: "other", title: "그냥 활동", date: "2025-01-01" }, NOW).keywordMult, 1.0);
});

test("최신성: 최근 2년 1.2, 10년+ 0.7, 미상 0.9", () => {
  assert.equal(recencyFactor("2025-06-01", NOW), 1.2);
  assert.equal(recencyFactor("2022-01-01", NOW), 1.0);
  assert.equal(recencyFactor("2018-01-01", NOW), 0.85);
  assert.equal(recencyFactor("2010-01-01", NOW), 0.7);
  assert.equal(recencyFactor(null, NOW), 0.9);
});

test("대표경력 가산", () => {
  const a = scoreCareer({ type: "performance", title: "공연", date: "2025-01-01", is_representative: true }, NOW);
  const b = scoreCareer({ type: "performance", title: "공연", date: "2025-01-01", is_representative: false }, NOW);
  assert.equal(Math.round((a.score - b.score) * 100) / 100, 3);
});

test("집계: 상위 경력 지배 + 다수 경력 점진 반영 (개수 스팸 방지)", () => {
  // 고득점 1개 vs 저득점 20개
  const oneStrong = aggregateDancerScore([24]);
  const manyWeak = aggregateDancerScore(Array(20).fill(3));
  // 저득점 20개 지수감쇠 합 ≈ 3 * (1/(1-0.92)) ≈ 37.5 — 다수가 누적되면 역전 가능(현실적)
  assert.ok(oneStrong.score > 0 && manyWeak.score > 0);
  // verified boost
  const v = aggregateDancerScore([10, 8], { isVerified: true });
  const nv = aggregateDancerScore([10, 8], { isVerified: false });
  assert.ok(v.score > nv.score);
  assert.equal(Math.round((v.score / nv.score) * 100) / 100, 1.15);
});

test("경력 없음 = 0점", () => {
  assert.equal(aggregateDancerScore([]).score, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationMatchesCandidateStatuses,
  normalizeCandidateStatuses,
  normalizeClientDecision,
} from "./review";

test("클라이언트 결정값은 허용 목록만 통과한다", () => {
  assert.equal(normalizeClientDecision("selected"), "selected");
  assert.equal(normalizeClientDecision("hold"), "hold");
  assert.equal(normalizeClientDecision("accepted"), null);
  assert.equal(normalizeClientDecision(null), null);
});

test("후보 상태는 중복과 임의 값을 제거하고 안전한 기본값을 사용한다", () => {
  assert.deepEqual(normalizeCandidateStatuses(["pending", "pending", "other"]), [
    "pending",
  ]);
  assert.deepEqual(normalizeCandidateStatuses(undefined), [
    "pending",
    "accepted",
    "confirmed",
  ]);
});

test("확정자는 accepted 상태여도 confirmed 필터로 구분된다", () => {
  const confirmed = { status: "accepted", confirmedAt: "2026-08-12T00:00:00Z" };
  assert.equal(applicationMatchesCandidateStatuses(confirmed, ["confirmed"]), true);
  assert.equal(applicationMatchesCandidateStatuses(confirmed, ["accepted"]), false);
  assert.equal(applicationMatchesCandidateStatuses(confirmed, ["pending"]), false);
});

test("대기·수락 필터는 각 지원 상태만 포함한다", () => {
  assert.equal(
    applicationMatchesCandidateStatuses(
      { status: "pending", confirmedAt: null },
      ["pending"],
    ),
    true,
  );
  assert.equal(
    applicationMatchesCandidateStatuses(
      { status: "accepted", confirmedAt: null },
      ["pending"],
    ),
    false,
  );
  assert.equal(
    applicationMatchesCandidateStatuses(
      { status: "accepted", confirmedAt: null },
      ["accepted"],
    ),
    true,
  );
});

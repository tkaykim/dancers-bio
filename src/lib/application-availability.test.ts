import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { resolveAvailabilitySelection } from "./application-availability.ts";

test("선택한 일정은 가능, 나머지는 불가로 정규화한다", () => {
  assert.deepEqual(resolveAvailabilitySelection(["a", "b", "c"], ["a", "c"]), {
    ok: true,
    responses: [
      { schedule_id: "a", status: "available" },
      { schedule_id: "b", status: "unavailable" },
      { schedule_id: "c", status: "available" },
    ],
  });
});

test("가능여부 수집 일정이 있으면 하나 이상 선택해야 한다", () => {
  assert.deepEqual(resolveAvailabilitySelection(["a"], []), {
    ok: false,
    error: "참석 가능한 일정을 하나 이상 선택해 주세요.",
  });
});

test("다른 프로젝트의 일정 ID는 거부한다", () => {
  assert.deepEqual(resolveAvailabilitySelection(["a"], ["foreign"]), {
    ok: false,
    error: "선택한 일정 정보를 다시 확인해 주세요.",
  });
});

test("가능여부 수집 일정이 없는 공고는 기존 지원 흐름을 유지한다", () => {
  assert.deepEqual(resolveAvailabilitySelection([], []), {
    ok: true,
    responses: [],
  });
});

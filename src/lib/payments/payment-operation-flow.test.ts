import assert from "node:assert/strict";
import test from "node:test";

// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { buildInitialPaymentOperationState } from "./payment-operation-flow.ts";

const actor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  actorName: "대표 관리자",
  now: "2026-08-30T00:00:00.000Z",
};

test("일반 관리자의 결제 작업은 2인 승인 대기로 저장한다", () => {
  assert.deepEqual(buildInitialPaymentOperationState({ ...actor, canExecuteDirectly: false }), {
    execution_mode: "two_person",
    status: "requested",
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    processed_at: null,
    version: 1,
  });
});

test("허용된 관리자의 결제 작업은 본인 승인 기록과 함께 즉시 처리 상태로 저장한다", () => {
  assert.deepEqual(buildInitialPaymentOperationState({ ...actor, canExecuteDirectly: true }), {
    execution_mode: "direct",
    status: "processing",
    approved_by: actor.actorId,
    approved_by_name: actor.actorName,
    approved_at: actor.now,
    processed_at: actor.now,
    version: 2,
  });
});

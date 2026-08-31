import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { computeSettlementPayouts, resolvePayoutStage } from "./payout-state.ts";

const earn = (id: string, amount: number, at: string) => ({
  entryType: "earn", refType: "settlement", refId: id, amount, createdAt: at,
});
const withdraw = (amount: number, at: string) => ({
  entryType: "withdraw", refType: "withdrawal_request", refId: "w", amount: -amount, createdAt: at,
});

test("전액 이체된 정산은 지급 완료 + 이체 시각", () => {
  const m = computeSettlementPayouts(
    [earn("s1", 1934000, "2026-08-25T01:36:48Z"), withdraw(1934000, "2026-08-27T08:23:58Z")], 0);
  const s = m.get("s1")!;
  assert.equal(s.stage, "paid");
  assert.equal(s.paidAmount, 1934000);
  assert.equal(s.paidAt, "2026-08-27T08:23:58Z");
});

test("적립만 있고 출금 없으면 출금 가능", () => {
  const m = computeSettlementPayouts([earn("s1", 212740, "2026-08-25T00:00:00Z")], 0);
  assert.equal(m.get("s1")!.stage, "withdrawable");
  assert.equal(m.get("s1")!.paidAt, null);
});

test("출금 신청만 하고 이체 전이면 출금 신청됨", () => {
  const m = computeSettlementPayouts([earn("s1", 967000, "2026-08-25T00:00:00Z")], 967000);
  const s = m.get("s1")!;
  assert.equal(s.stage, "requested");
  assert.equal(s.reservedAmount, 967000);
  assert.equal(s.paidAmount, 0);
});

test("FIFO — 먼저 적립된 건이 먼저 소진된다", () => {
  const m = computeSettlementPayouts([
    earn("old", 100000, "2026-08-01T00:00:00Z"),
    earn("new", 200000, "2026-08-10T00:00:00Z"),
    withdraw(100000, "2026-08-20T00:00:00Z"),
  ], 0);
  assert.equal(m.get("old")!.stage, "paid");
  assert.equal(m.get("new")!.stage, "withdrawable");
});

test("부분 출금이 두 번째 건에 걸치면 일부 지급", () => {
  const m = computeSettlementPayouts([
    earn("a", 100000, "2026-08-01T00:00:00Z"),
    earn("b", 100000, "2026-08-02T00:00:00Z"),
    withdraw(150000, "2026-08-20T00:00:00Z"),
  ], 0);
  assert.equal(m.get("a")!.stage, "paid");
  const b = m.get("b")!;
  assert.equal(b.stage, "partially_paid");
  assert.equal(b.paidAmount, 50000);
  assert.equal(b.paidAt, null);
});

test("지급 완료분 다음에 신청분이 배분된다", () => {
  const m = computeSettlementPayouts([
    earn("a", 100000, "2026-08-01T00:00:00Z"),
    earn("b", 100000, "2026-08-02T00:00:00Z"),
    withdraw(100000, "2026-08-20T00:00:00Z"),
  ], 100000);
  assert.equal(m.get("a")!.stage, "paid");
  assert.equal(m.get("b")!.stage, "requested");
});

test("여러 번 나눠 출금해도 합계로 판정한다", () => {
  const m = computeSettlementPayouts([
    earn("s1", 96700, "2026-08-01T00:00:00Z"),
    withdraw(30000, "2026-08-10T00:00:00Z"),
    withdraw(66700, "2026-08-11T00:00:00Z"),
  ], 0);
  const s = m.get("s1")!;
  assert.equal(s.stage, "paid");
  assert.equal(s.paidAt, "2026-08-11T00:00:00Z");
});

test("구 경로 requested 예약분도 신청됨으로 잡힌다", () => {
  const m = computeSettlementPayouts([earn("s1", 212740, "2026-08-01T00:00:00Z")], 0, 212740);
  assert.equal(m.get("s1")!.stage, "requested");
});

test("금액 미확정은 원장과 무관하게 확정 대기", () => {
  assert.equal(resolvePayoutStage("pending", null, undefined), "awaiting_amount");
  assert.equal(resolvePayoutStage("pending", 0, undefined), "awaiting_amount");
});

test("구 경로 paid 정산은 그대로 지급 완료", () => {
  assert.equal(resolvePayoutStage("paid", 100000, undefined), "paid");
});

test("원장 정보가 없으면 출금 가능으로 폴백", () => {
  assert.equal(resolvePayoutStage("pending", 100000, undefined), "withdrawable");
});

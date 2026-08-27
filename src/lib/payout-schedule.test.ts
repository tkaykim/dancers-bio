import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { expectedPayoutDate, expectedPayoutLabel, formatPayoutDate, kstYear, nextPayoutDate } from "./payout-schedule.ts";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("수요일(KST) 신청은 같은 주 금요일", () => {
  const wed = new Date("2026-08-26T10:00:00+09:00");
  assert.equal(iso(nextPayoutDate(wed)), "2026-08-28");
});

test("목요일(KST) 신청은 다음 날 금요일", () => {
  const thu = new Date("2026-08-27T23:30:00+09:00");
  assert.equal(iso(nextPayoutDate(thu)), "2026-08-28");
});

test("금요일 신청은 다음 주 금요일 (목요일 마감)", () => {
  const fri = new Date("2026-08-28T09:00:00+09:00");
  assert.equal(iso(nextPayoutDate(fri)), "2026-09-04");
});

test("토·일 신청도 다음 주 금요일", () => {
  assert.equal(
    iso(nextPayoutDate(new Date("2026-08-29T12:00:00+09:00"))),
    "2026-09-04",
  );
  assert.equal(
    iso(nextPayoutDate(new Date("2026-08-30T12:00:00+09:00"))),
    "2026-09-04",
  );
});

test("UTC 목요일 저녁 = KST 금요일 새벽으로 판정 (시간대 경계)", () => {
  // 2026-08-27T16:00Z = KST 8/28(금) 01:00 → 다음 주 금요일
  const utcThuEvening = new Date("2026-08-27T16:00:00Z");
  assert.equal(iso(nextPayoutDate(utcThuEvening)), "2026-09-04");
});

test("예정일이 지난 미지급 건은 다가오는 금요일로 재안내", () => {
  const oldRequest = new Date("2026-08-01T10:00:00+09:00");
  const now = new Date("2026-08-26T10:00:00+09:00");
  assert.equal(iso(expectedPayoutDate(oldRequest, now)), "2026-08-28");
});

test("오늘이 금요일이면 밀린 건은 오늘 배치로 안내", () => {
  const oldRequest = new Date("2026-08-01T10:00:00+09:00");
  const friday = new Date("2026-08-28T09:00:00+09:00");
  const result = expectedPayoutDate(oldRequest, friday);
  assert.equal(iso(result), "2026-08-28");
  assert.equal(formatPayoutDate(result, friday), "오늘(금)");
});

test("라벨 형식은 M/D(요일)", () => {
  const wed = new Date("2026-08-26T10:00:00+09:00");
  assert.equal(expectedPayoutLabel("2026-08-26T01:00:00Z", wed), "8/28(금)");
});

test("잘못된 requested_at은 다가오는 지급일로 폴백", () => {
  const wed = new Date("2026-08-26T10:00:00+09:00");
  assert.equal(expectedPayoutLabel("not-a-date", wed), "8/28(금)");
});

test("kstYear는 KST 기준 연도 (UTC 12/31 저녁 = KST 새해)", () => {
  assert.equal(kstYear("2025-12-31T16:30:00Z"), 2026);
  assert.equal(kstYear("2026-03-01T00:00:00+09:00"), 2026);
});

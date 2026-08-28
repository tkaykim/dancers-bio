import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { expectedPayoutDate, expectedPayoutLabel, filterByKstPeriod, formatPayoutDate, groupByKstMonth, kstDayLabel, kstMonthKey, kstMonthLabel, kstPeriodRange, kstTodayParts, kstYear, nextPayoutDate, parsePayoutPeriod, payoutPeriodLabel, sumByKstYear } from "./payout-schedule.ts";

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

// ── 기간별 정산 내역(/me/settlements/history) ─────────────────────────

test("kstMonthKey는 KST 월 (UTC 7/31 저녁 = KST 8월)", () => {
  assert.equal(kstMonthKey("2026-07-31T15:30:00Z"), "2026-08");
  assert.equal(kstMonthKey("2026-07-31T14:59:00Z"), "2026-07");
  assert.equal(kstMonthKey("2026-12-31T16:00:00Z"), "2027-01");
});

test("kstMonthLabel·kstDayLabel 표기", () => {
  assert.equal(kstMonthLabel("2026-08"), "2026년 8월");
  // 2026-08-17T15:10Z = KST 8/18(화) 00:10
  assert.equal(kstDayLabel("2026-08-17T15:10:00Z"), "18일 (화)");
});

test("kstTodayParts는 KST 달력 (UTC 자정 직전 = KST 다음 날)", () => {
  assert.deepEqual(kstTodayParts(new Date("2026-08-27T15:30:00Z")), {
    year: 2026,
    month: 8,
    day: 28,
  });
});

test("이번 달 경계는 KST 1일 00:00 ~ 다음 달 1일 00:00", () => {
  const now = new Date("2026-08-15T03:00:00Z");
  assert.deepEqual(kstPeriodRange("month", { now }), {
    from: "2026-08-01T00:00:00+09:00",
    toExclusive: "2026-09-01T00:00:00+09:00",
  });
});

test("12월 이번 달은 다음 해 1월로 넘어간다", () => {
  const now = new Date("2026-12-20T03:00:00Z");
  assert.deepEqual(kstPeriodRange("month", { now }), {
    from: "2026-12-01T00:00:00+09:00",
    toExclusive: "2027-01-01T00:00:00+09:00",
  });
});

test("연도 기간은 지난 해도 상한까지 닫는다", () => {
  assert.deepEqual(kstPeriodRange("year", { year: 2025 }), {
    from: "2025-01-01T00:00:00+09:00",
    toExclusive: "2026-01-01T00:00:00+09:00",
  });
});

test("전체는 경계 없음", () => {
  assert.deepEqual(kstPeriodRange("all"), { from: null, toExclusive: null });
});

test("직접 선택의 끝날은 하루 통째로 포함(상한은 다음 날 00:00)", () => {
  assert.deepEqual(
    kstPeriodRange("custom", { from: "2026-07-01", to: "2026-08-31" }),
    {
      from: "2026-07-01T00:00:00+09:00",
      toExclusive: "2026-09-01T00:00:00+09:00",
    },
  );
  // 연말 넘김
  assert.equal(
    kstPeriodRange("custom", { to: "2026-12-31" }).toExclusive,
    "2027-01-01T00:00:00+09:00",
  );
});

test("직접 선택의 잘못된 날짜 문자열은 무시", () => {
  assert.deepEqual(
    kstPeriodRange("custom", { from: "2026/07/01", to: "drop table" }),
    { from: null, toExclusive: null },
  );
});

test("형식만 맞고 달력에 없는 날짜는 상한을 열어두지 않는다", () => {
  // 2026-13-99를 그대로 Date에 넣으면 2027년 어딘가로 넘어가서, 화면은
  // "~ 2026-13-99"라 써놓고 실제로는 전 기간을 보여주게 된다.
  assert.deepEqual(kstPeriodRange("custom", { to: "2026-13-99" }), {
    from: null,
    toExclusive: null,
  });
  assert.deepEqual(kstPeriodRange("custom", { from: "2026-02-30" }), {
    from: null,
    toExclusive: null,
  });
  assert.equal(payoutPeriodLabel("custom", { to: "2026-13-99" }), "전체");
  // 윤년 2월 29일은 실재하는 날짜라 통과해야 한다
  assert.equal(
    kstPeriodRange("custom", { from: "2028-02-29" }).from,
    "2028-02-29T00:00:00+09:00",
  );
});

test("끝날 23:59:59.5 입금도 기간에 포함된다", () => {
  const range = kstPeriodRange("custom", { from: "2026-08-01", to: "2026-08-31" });
  const rows = [
    { paidAt: "2026-08-31T23:59:59.500+09:00", amount: 100 }, // 포함
    { paidAt: "2026-09-01T00:00:00+09:00", amount: 200 }, // 제외(다음 달)
    { paidAt: "2026-07-31T23:59:59+09:00", amount: 300 }, // 제외(이전 달)
  ];
  assert.deepEqual(
    filterByKstPeriod(rows, range).map((r) => r.amount),
    [100],
  );
});

test("잘못된 입금일 행은 기간 필터·집계에서 빠진다", () => {
  const rows = [{ paidAt: "not-a-date", amount: 100 }];
  assert.equal(filterByKstPeriod(rows, kstPeriodRange("all")).length, 0);
  assert.equal(groupByKstMonth(rows).length, 0);
  assert.deepEqual(sumByKstYear(rows), {});
});

test("월별 그룹은 최신 월·최신 건 순이고 소계가 맞는다", () => {
  const rows = [
    { paidAt: "2026-07-10T02:00:00Z", amount: 96_700, id: "a" },
    { paidAt: "2026-08-18T14:05:42Z", amount: 212_740, id: "b" },
    { paidAt: "2026-08-27T08:23:57Z", amount: 30_000, id: "c" },
    // KST로는 8/1 00:30 → 7월이 아니라 8월 버킷
    { paidAt: "2026-07-31T15:30:00Z", amount: 1_000, id: "d" },
  ];
  const groups = groupByKstMonth(rows);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["2026-08", "2026-07"],
  );
  assert.deepEqual(
    groups[0].rows.map((r) => r.id),
    ["c", "b", "d"],
  );
  assert.equal(groups[0].total, 243_740);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[1].total, 96_700);
  assert.equal(groups[0].label, "2026년 8월");
  // 소계 합 = 전체 합 (버킷 누락·중복 없음)
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(
    groups.reduce((s, g) => s + g.total, 0),
    sum,
  );
});

test("연도별 합계는 두 원천을 합치고 KST 연도로 가른다", () => {
  // 구 경로 정산 실수령 + 잔액 출금 — 경로가 갈려 이중계상이 없다.
  const rows = [
    { paidAt: "2025-12-31T16:30:00Z", amount: 386_800 }, // KST 2026-01-01
    { paidAt: "2026-08-18T14:05:42Z", amount: 212_740 },
    { paidAt: "2026-08-27T08:23:57Z", amount: 30_000 },
    { paidAt: "2025-06-15T09:03:36Z", amount: 96_700 },
  ];
  assert.deepEqual(sumByKstYear(rows), { 2026: 629_540, 2025: 96_700 });
});

test("period 파라미터는 알려진 값만 통과", () => {
  assert.equal(parsePayoutPeriod("month"), "month");
  assert.equal(parsePayoutPeriod("custom"), "custom");
  assert.equal(parsePayoutPeriod("../etc"), "year");
  assert.equal(parsePayoutPeriod(undefined), "year");
  assert.equal(parsePayoutPeriod(null, "all"), "all");
});

test("기간 라벨", () => {
  assert.equal(payoutPeriodLabel("month"), "이번 달");
  assert.equal(payoutPeriodLabel("all"), "전체");
  assert.equal(payoutPeriodLabel("year", { year: 2025 }), "2025년");
  assert.equal(
    payoutPeriodLabel("custom", { from: "2026-07-01", to: "2026-08-31" }),
    "2026-07-01 ~ 2026-08-31",
  );
  assert.equal(payoutPeriodLabel("custom", { from: "2026-07-01" }), "2026-07-01 ~ 오늘");
  // 날짜 미선택 = 아무것도 안 거른 상태라 '전체'로 말한다
  assert.equal(payoutPeriodLabel("custom", {}), "전체");
});

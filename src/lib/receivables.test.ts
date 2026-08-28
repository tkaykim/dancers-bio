import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { calculateUnitPricing, dealTermsSummary } from "./receivables.ts";

test("서로 다른 단가 항목을 공급가액과 부가세로 계산한다", () => {
  const regular = calculateUnitPricing({ quantity: 81, unitPrice: 70_000 });
  const collaboration = calculateUnitPricing({
    quantity: 10,
    unitPrice: 100_000,
  });

  assert.deepEqual(regular, {
    supplyAmount: 5_670_000,
    vatAmount: 567_000,
    totalAmount: 6_237_000,
  });
  assert.deepEqual(collaboration, {
    supplyAmount: 1_000_000,
    vatAmount: 100_000,
    totalAmount: 1_100_000,
  });
  assert.equal(regular.supplyAmount + collaboration.supplyAmount, 6_670_000);
  assert.equal(regular.totalAmount + collaboration.totalAmount, 7_337_000);
});

test("면세 혼합 항목은 부가세를 0원으로 계산한다", () => {
  assert.deepEqual(
    calculateUnitPricing({ quantity: 2, unitPrice: 50_000, taxFree: true }),
    { supplyAmount: 100_000, vatAmount: 0, totalAmount: 100_000 },
  );
});

test("혼합형 계약 요약에 최종 계약금액을 표시한다", () => {
  assert.equal(
    dealTermsSummary({
      pricing_model: "composite",
      unit_price: null,
      unit_label: null,
      quantity_cap: 200,
      quantity_min: null,
      min_guarantee_amount: null,
      revenue_share_pct: null,
      expected_supply_amount: 6_670_000,
    }),
    "혼합 · 계약금액 6,670,000원 (항목별 내역)",
  );
});

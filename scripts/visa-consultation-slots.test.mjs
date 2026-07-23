import assert from "node:assert/strict";
import test from "node:test";
import {
  consultationSlotsFromAnswers,
  formatConsultationAvailability,
  hasThreeUniqueConsultationSlots,
} from "../src/lib/visa/consultation-slots.ts";

test("converts the legacy semicolon schedule into three datetime-local values", () => {
  assert.deepEqual(
    consultationSlotsFromAnswers({
      consultationAvailability:
        "2026-07-27 14:00 KST; 2026-07-28 11:00 KST; 2026-07-29 16:00 KST",
    }),
    ["2026-07-27T14:00", "2026-07-28T11:00", "2026-07-29T16:00"],
  );
});

test("can re-read the numbered compatibility summary", () => {
  assert.deepEqual(
    consultationSlotsFromAnswers({
      consultationAvailability: [
        "1. 2026-07-27 14:00 (Asia/Seoul)",
        "2. 2026-07-28 11:00 (Asia/Seoul)",
        "3. 2026-07-29 16:00 (Asia/Seoul)",
      ].join("\n"),
    }),
    ["2026-07-27T14:00", "2026-07-28T11:00", "2026-07-29T16:00"],
  );
});

test("prefers structured slots and rejects duplicate options", () => {
  const slots = consultationSlotsFromAnswers({
    consultationSlots: [
      "2026-07-27T14:00",
      "2026-07-28T11:00",
      "2026-07-29T16:00",
    ],
    consultationAvailability: "legacy text",
  });

  assert.equal(hasThreeUniqueConsultationSlots(slots), true);
  assert.equal(
    hasThreeUniqueConsultationSlots([
      "2026-07-27T14:00",
      "2026-07-27T14:00",
      "2026-07-29T16:00",
    ]),
    false,
  );
});

test("rejects impossible dates and invalid trailing text", () => {
  assert.equal(
    hasThreeUniqueConsultationSlots([
      "2026-02-30T14:00",
      "2026-07-28T11:00",
      "2026-07-29T16:00",
    ]),
    false,
  );
  assert.equal(
    hasThreeUniqueConsultationSlots([
      "2026-07-27T14:00 KST extra",
      "2026-07-28T11:00",
      "2026-07-29T16:00",
    ]),
    false,
  );
});

test("keeps a readable compatibility summary for operations", () => {
  assert.equal(
    formatConsultationAvailability(
      [
        "2026-07-27T14:00",
        "2026-07-28T11:00",
        "2026-07-29T16:00",
      ],
      "Asia/Seoul",
    ),
    [
      "1. 2026-07-27 14:00 (Asia/Seoul)",
      "2. 2026-07-28 11:00 (Asia/Seoul)",
      "3. 2026-07-29 16:00 (Asia/Seoul)",
    ].join("\n"),
  );
});

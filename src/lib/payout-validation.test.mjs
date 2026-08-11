import assert from "node:assert/strict";
import test from "node:test";
import {
  isPayoutAccountValid,
  isPayoutInfoComplete,
  isResidentNumberValid,
  formatResidentNumberInput,
  normalizeAccountNumber,
  normalizeResidentNumber,
} from "./payout-validation.ts";

function syntheticResidentNumber(firstTwelve) {
  assert.match(firstTwelve, /^[0-9]{12}$/);
  const values = firstTwelve.split("").map(Number);
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = weights.reduce(
    (total, weight, index) => total + weight * values[index],
    0,
  );
  let check = (11 - (sum % 11)) % 10;
  if (values[6] >= 5) check = (check + 2) % 10;
  return `${firstTwelve}${check}`;
}

test("normalizes payout identifiers without accepting non-digits", () => {
  assert.equal(normalizeAccountNumber("123-456 7890"), "1234567890");
  assert.equal(normalizeResidentNumber("900101-1234567"), "9001011234567");
  assert.equal(normalizeResidentNumber("900101-A234567"), null);
  assert.equal(formatResidentNumberInput("9001011234567"), "900101-1234567");
  assert.equal(formatResidentNumberInput("900101-12ab34567"), "900101-1234567");
});

test("validates domestic and foreign resident numbers", () => {
  assert.equal(isResidentNumberValid(syntheticResidentNumber("900101123456")), true);
  assert.equal(isResidentNumberValid(syntheticResidentNumber("900101523456")), true);
  assert.equal(isResidentNumberValid(syntheticResidentNumber("900230123456")), false);
  assert.equal(isResidentNumberValid("9001011234567"), false);
});

test("requires bank, numeric account, holder, and a valid resident number", () => {
  const complete = {
    bank_name: "우리은행",
    bank_account_number: "123-456-7890",
    bank_account_holder: "테스트",
    resident_registration_number: syntheticResidentNumber("900101123456"),
  };
  assert.equal(isPayoutAccountValid(complete), true);
  assert.equal(isPayoutInfoComplete(complete), true);
  assert.equal(isPayoutInfoComplete({ ...complete, bank_account_number: "1234" }), false);
  assert.equal(isPayoutInfoComplete({ ...complete, resident_registration_number: null }), false);
});

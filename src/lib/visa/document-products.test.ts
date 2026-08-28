import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { isPaidVisaDocumentCase, visaDocumentProductSlug } from "./document-products.ts";

test("direct deetz program payment is eligible", () => {
  const application = {
    payment_status: "paid",
    payment_meta: { issued_product_slug: "training-and-placement" },
    program_product_slug: null,
  };
  assert.equal(isPaidVisaDocumentCase(application), true);
  assert.equal(visaDocumentProductSlug(application), "training-and-placement");
});

test("synced monthly training payment is eligible", () => {
  const application = {
    payment_status: "paid",
    payment_meta: null,
    program_product_slug: "monthly-training-100",
  };
  assert.equal(isPaidVisaDocumentCase(application), true);
});

test("audition fee and incomplete payments are not eligible", () => {
  assert.equal(isPaidVisaDocumentCase({
    payment_status: "paid",
    payment_meta: { issued_product_slug: "audition-fee" },
    program_product_slug: null,
  }), false);
  assert.equal(isPaidVisaDocumentCase({
    payment_status: "link_sent",
    payment_meta: { issued_product_slug: "training-and-placement" },
    program_product_slug: null,
  }), false);
});

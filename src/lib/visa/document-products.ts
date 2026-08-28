export const VISA_DOCUMENT_PRODUCT_SLUGS = [
  "training-and-placement",
  "monthly-training",
  "monthly-training-100",
] as const;

export type VisaDocumentPaymentCase = {
  payment_status: string | null;
  payment_meta: Record<string, unknown> | null;
  program_product_slug: string | null;
};

const productSlugSet = new Set<string>(VISA_DOCUMENT_PRODUCT_SLUGS);

export function visaDocumentProductSlug(
  application: VisaDocumentPaymentCase,
): string | null {
  const issuedSlug = application.payment_meta?.issued_product_slug;
  const productSlug = application.program_product_slug ??
    (typeof issuedSlug === "string" ? issuedSlug : null);
  return productSlug && productSlugSet.has(productSlug) ? productSlug : null;
}

export function isPaidVisaDocumentCase(
  application: VisaDocumentPaymentCase,
): boolean {
  return application.payment_status === "paid" && Boolean(visaDocumentProductSlug(application));
}

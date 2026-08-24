export type PayoutInfo = {
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  resident_registration_number?: string | null;
};

export function normalizeAccountNumber(value: unknown): string {
  return String(value ?? "").replace(/[\s-]/g, "");
}

export function isPayoutAccountValid(
  info: PayoutInfo | null | undefined,
): boolean {
  return !!(
    info?.bank_name?.trim() &&
    info?.bank_account_holder?.trim() &&
    /^[0-9]{8,20}$/.test(normalizeAccountNumber(info.bank_account_number))
  );
}

export function normalizeResidentNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  return /^[0-9]{13}$/.test(digits) ? digits : null;
}

export function formatResidentNumberInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  return digits.length > 6
    ? `${digits.slice(0, 6)}-${digits.slice(6)}`
    : digits;
}

export function isResidentNumberValid(value: unknown): boolean {
  const digits = normalizeResidentNumber(value);
  if (!digits || !/^[1-8]$/.test(digits[6])) return false;

  const century = "1256".includes(digits[6]) ? 1900 : 2000;
  const year = century + Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const values = digits.split("").map(Number);
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = weights.reduce(
    (total, weight, index) => total + weight * values[index],
    0,
  );
  let check = (11 - (sum % 11)) % 10;
  if (values[6] >= 5) check = (check + 2) % 10;
  return check === values[12];
}

export function isPayoutInfoComplete(
  info: PayoutInfo | null | undefined,
): boolean {
  return (
    isPayoutAccountValid(info) &&
    isResidentNumberValid(info?.resident_registration_number)
  );
}

// ── 수취인 세무 유형 인지 검증 (스태프 정산 풀 — 사업자는 주민번호 대신 사업자번호) ──

export type PayeeTaxInfo = PayoutInfo & {
  payee_tax_mode?: string | null;
  business_registration_number?: string | null;
};

export function normalizeBusinessNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  return /^[0-9]{10}$/.test(digits) ? digits : null;
}

/**
 * 지급 가능 여부 — withholding(3.3%)은 계좌+주민번호, invoice(사업자)는 계좌+사업자번호.
 * 사업자 건의 이체 조건(세금계산서 수취)은 별도(settlements.tax_invoice_received_at).
 */
export function isPayeePayoutReady(
  info: PayeeTaxInfo | null | undefined,
): boolean {
  if ((info?.payee_tax_mode ?? "withholding") === "invoice") {
    return (
      isPayoutAccountValid(info) &&
      !!normalizeBusinessNumber(info?.business_registration_number)
    );
  }
  return isPayoutInfoComplete(info);
}

import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type PhoneParseResult =
  | { ok: true; e164: string; country: CountryCode }
  | { ok: false; error: string };

export type PhoneCountryOption = {
  code: CountryCode;
  callingCode: string;
  label: string;
};

const PRIORITY_COUNTRIES: CountryCode[] = [
  "KR",
  "US",
  "JP",
  "CN",
  "TH",
  "VN",
  "PH",
  "ID",
  "SG",
  "MY",
  "CA",
  "AU",
  "GB",
];

const PRIORITY_COUNTRY_LABELS: Partial<Record<CountryCode, string>> = {
  KR: "대한민국 / South Korea",
  US: "United States",
  JP: "Japan",
  CN: "China",
  TH: "Thailand",
  VN: "Vietnam",
  PH: "Philippines",
  ID: "Indonesia",
  SG: "Singapore",
  MY: "Malaysia",
  CA: "Canada",
  AU: "Australia",
  GB: "United Kingdom",
};

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export const PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = getCountries()
  .map((code) => ({
    code,
    callingCode: getCountryCallingCode(code),
    label: PRIORITY_COUNTRY_LABELS[code] ?? REGION_NAMES.of(code) ?? code,
  }))
  .sort((a, b) => {
    const aPriority = PRIORITY_COUNTRIES.indexOf(a.code);
    const bPriority = PRIORITY_COUNTRIES.indexOf(b.code);
    if (aPriority !== -1 || bPriority !== -1) {
      if (aPriority === -1) return 1;
      if (bPriority === -1) return -1;
      return aPriority - bPriority;
    }
    return a.code.localeCompare(b.code, "en");
  });

export function parseInternationalPhone(
  rawValue: string,
  rawCountry: string,
): PhoneParseResult {
  const value = rawValue.trim();
  const country = rawCountry.trim().toUpperCase();

  if (!value) {
    return {
      ok: false,
      error: "휴대폰 번호를 입력해 주세요. / Enter your mobile number.",
    };
  }

  if (value.length > 40 || !isSupportedCountry(country)) {
    return {
      ok: false,
      error: "국가와 전화번호를 다시 확인해 주세요. / Check the country and phone number.",
    };
  }

  try {
    const phone = parsePhoneNumberFromString(value, country as CountryCode);
    if (!phone?.isValid()) {
      return {
        ok: false,
        error: "올바른 휴대폰 번호를 입력해 주세요. / Enter a valid mobile number.",
      };
    }

    return {
      ok: true,
      e164: phone.number,
      country: phone.country ?? (country as CountryCode),
    };
  } catch {
    return {
      ok: false,
      error: "올바른 휴대폰 번호를 입력해 주세요. / Enter a valid mobile number.",
    };
  }
}

export function inferPhoneCountry(value: string | null | undefined): CountryCode {
  if (!value?.trim()) return "KR";

  try {
    return parsePhoneNumberFromString(value, "KR")?.country ?? "KR";
  } catch {
    return "KR";
  }
}

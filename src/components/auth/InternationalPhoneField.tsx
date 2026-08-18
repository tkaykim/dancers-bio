"use client";

import { useMemo, useState } from "react";
import type { CountryCode } from "libphonenumber-js/min";
import {
  PHONE_COUNTRY_OPTIONS,
  inferPhoneCountry,
  parseInternationalPhone,
} from "@/lib/phone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  idPrefix: string;
  defaultValue?: string | null;
  defaultUnavailable?: boolean;
  privacyHint?: boolean;
};

export function InternationalPhoneField({
  idPrefix,
  defaultValue = "",
  defaultUnavailable = false,
  privacyHint = false,
}: Props) {
  const [country, setCountry] = useState<CountryCode>(() => inferPhoneCountry(defaultValue));
  const [phone, setPhone] = useState(defaultValue ?? "");
  const [unavailable, setUnavailable] = useState(defaultUnavailable);
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(
    () => (phone.trim() ? parseInternationalPhone(phone, country) : null),
    [country, phone],
  );

  const helpId = `${idPrefix}-phone-help`;
  const feedbackId = `${idPrefix}-phone-feedback`;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">
        휴대폰 번호 <span className="font-normal text-ink-3">/ Mobile number</span>
      </legend>

      <div
        className={
          "grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2 transition-opacity " +
          (unavailable ? "opacity-50" : "")
        }
      >
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-phone-country`} className="sr-only">
            국가 및 국가번호 / Country and calling code
          </Label>
          <select
            id={`${idPrefix}-phone-country`}
            name="phone_country"
            value={country}
            onChange={(event) => {
              setCountry(event.target.value as CountryCode);
              if (phone.trim()) setTouched(true);
            }}
            disabled={unavailable}
            autoComplete="tel-country-code"
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
          >
            {PHONE_COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                +{option.callingCode} {option.code} · {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-phone`} className="sr-only">
            휴대폰 번호 / Mobile number
          </Label>
          <Input
            id={`${idPrefix}-phone`}
            name="phone"
            type="tel"
            required={!unavailable}
            disabled={unavailable}
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={country === "KR" ? "010-1234-5678" : "Phone number"}
            aria-invalid={!unavailable && touched && parsed?.ok === false}
            aria-describedby={`${helpId} ${feedbackId}`}
          />
        </div>
      </div>

      {unavailable ? (
        <>
          <input type="hidden" name="phone" value="" />
          <input type="hidden" name="phone_country" value={country} />
        </>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-hairline-2 bg-secondary/40 px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="phone_unavailable"
          value="true"
          checked={unavailable}
          onChange={(event) => {
            setUnavailable(event.target.checked);
            setTouched(false);
          }}
          className="mt-0.5 size-4 shrink-0 accent-foreground"
        />
        <span className="leading-snug">
          <span className="block font-medium">사용할 수 있는 휴대폰 번호가 없어요</span>
          <span className="block text-xs text-ink-3">I don&apos;t have a mobile number I can use.</span>
        </span>
      </label>

      <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
        {privacyHint
          ? "섭외·정산 연락용이며 매니저에게만 보입니다. / Only managers can see it for casting and payment contact."
          : "캐스팅 연락에 사용하며, 국가번호를 포함해 안전하게 저장합니다. / Used for casting contact and stored with its country code."}
      </p>

      <p id={feedbackId} aria-live="polite" className="min-h-4 text-xs">
        {!unavailable && touched && parsed?.ok === false ? (
          <span className="text-destructive">{parsed.error}</span>
        ) : !unavailable && parsed?.ok ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            사용할 수 있는 번호 형식입니다. / Valid phone number.
          </span>
        ) : unavailable ? (
          <span className="text-ink-3">
            이메일로 주요 안내를 보내드립니다. / We&apos;ll contact you by email.
          </span>
        ) : null}
      </p>
    </fieldset>
  );
}

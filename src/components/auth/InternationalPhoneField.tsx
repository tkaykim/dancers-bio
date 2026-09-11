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
import { useT } from "@/lib/i18n/provider";
import type { KeyOf } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";
import validation from "@/lib/i18n/messages/validation";

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
  const t = useT(auth);
  // parseInternationalPhone 의 error 는 validation 사전 키(v.phone_*)다 (docs/design-i18n-ui.md §3.5).
  const tv = useT(validation);

  const parsed = useMemo(
    () => (phone.trim() ? parseInternationalPhone(phone, country) : null),
    [country, phone],
  );

  const helpId = `${idPrefix}-phone-help`;
  const feedbackId = `${idPrefix}-phone-feedback`;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">
        {t("phone.legend")}
      </legend>

      <div
        className={
          "grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2 transition-opacity " +
          (unavailable ? "opacity-50" : "")
        }
      >
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-phone-country`} className="sr-only">
            {t("phone.country_label")}
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
            {t("phone.number_label")}
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
            placeholder={country === "KR" ? "010-1234-5678" : t("phone.placeholder")}
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
          <span className="block font-medium">{t("phone.unavailable")}</span>
        </span>
      </label>

      <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
        {privacyHint ? t("phone.help_privacy") : t("phone.help_default")}
      </p>

      <p id={feedbackId} aria-live="polite" className="min-h-4 text-xs">
        {!unavailable && touched && parsed?.ok === false ? (
          <span className="text-destructive">{tv(parsed.error as KeyOf<typeof validation>)}</span>
        ) : !unavailable && parsed?.ok ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            {t("phone.valid")}
          </span>
        ) : unavailable ? (
          <span className="text-ink-3">
            {t("phone.email_only")}
          </span>
        ) : null}
      </p>
    </fieldset>
  );
}

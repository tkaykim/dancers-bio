"use client";

import { useEffect, useRef, useState } from "react";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  countryLabel,
} from "@/lib/data/countries";
import { KOREA_VISAS } from "@/lib/data/korea-visas";
import {
  normalizeNationalityOptions,
  MAX_NATIONALITIES,
  type NationalityOption,
} from "@/lib/nationality";
import { cn } from "@/lib/utils";

export type NationalityVisaValue = {
  nationalities: NationalityOption[];
  /** 하위 호환용 첫 번째 국적 코드 */
  nationality_code: string;
  /** 하위 호환용 첫 번째 국적 라벨 */
  nationality: string;
  is_korean_national: boolean;
  has_visa: boolean | null;
  visa_type: string;
  visa_type_other: string;
  visa_expiry: string;
};

const COUNTRY_OPTIONS: SearchableOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.code === "OTHER" ? c.ko : `${c.ko} (${c.en})`,
  keywords: `${c.en} ${c.ko} ${c.code}`,
}));

const VISA_OPTIONS: SearchableOption[] = KOREA_VISAS.map((v) => ({
  value: v.code,
  label: v.ko,
  keywords: `${v.code} ${v.en ?? ""} ${v.ko}`,
  group: v.group,
}));

export function buildNationalityVisaValue(
  partial?: Partial<NationalityVisaValue>,
): NationalityVisaValue {
  const fromList = normalizeNationalityOptions(partial?.nationalities);
  const legacyCode = partial?.nationality_code?.trim().toUpperCase() || DEFAULT_COUNTRY_CODE;
  const nationalities =
    fromList.length > 0
      ? fromList
      : [
          {
            code: legacyCode,
            label:
              partial?.nationality ||
              countryLabel(legacyCode, "ko"),
          },
        ];
  const code = nationalities[0]?.code || DEFAULT_COUNTRY_CODE;
  return {
    nationalities,
    nationality_code: code,
    nationality: nationalities[0]?.label || countryLabel(code, "ko"),
    is_korean_national:
      nationalities.some((item) => item.code === DEFAULT_COUNTRY_CODE),
    has_visa: partial?.has_visa ?? null,
    visa_type: partial?.visa_type ?? "",
    visa_type_other: partial?.visa_type_other ?? "",
    visa_expiry: partial?.visa_expiry ?? "",
  };
}

type Props = {
  /** 초기값 (편집/복원). 미지정 시 대한민국 기본. */
  defaultValue?: Partial<NationalityVisaValue>;
  /** 컨트롤드 사용(위저드) — 값 변경마다 호출 */
  onChange?: (value: NationalityVisaValue) => void;
  /** form action 용 hidden input 출력 (기본 true) */
  emitHiddenInputs?: boolean;
  /** hidden input name 접두사 (다중 폼 충돌 방지, 기본 없음) */
  className?: string;
};

/**
 * 국적(검색+드롭다운, 대한민국 기본) + 외국인 시 비자(유무 → 종류 검색/드롭다운/기타 → 만료일).
 * 회원가입 위저드(컨트롤드)와 프로필 편집폼(form action + hidden input) 양쪽에서 재사용.
 */
export function NationalityVisaFields({
  defaultValue,
  onChange,
  emitHiddenInputs = true,
  className,
}: Props) {
  const [state, setState] = useState<NationalityVisaValue>(() =>
    buildNationalityVisaValue(defaultValue),
  );

  // 초기 마운트의 emit은 건너뛰고(편집폼이 곧장 dirty 되는 것 방지),
  // 사용자 변경부터 onChange 통지.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChange?.(state);
    // onChange는 매 렌더 새로 만들어질 수 있어 의존성에서 제외 (state 변화만 트리거)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const setCountry = (code: string) => {
    const next = code || DEFAULT_COUNTRY_CODE;
    setState((prev) => {
      if (prev.nationalities.some((item) => item.code === next)) return prev;
      const nationalities = [
        ...prev.nationalities,
        { code: next, label: countryLabel(next, "ko") },
      ];
      const isKorean = nationalities.some(
        (item) => item.code === DEFAULT_COUNTRY_CODE,
      );
      return {
        ...prev,
        nationalities,
        nationality_code: nationalities[0].code,
        nationality: nationalities[0].label,
        is_korean_national: isKorean,
        // 한국 국적을 하나라도 가지면 한국 비자는 묻지 않는다.
        has_visa: isKorean ? null : prev.has_visa,
        visa_type: isKorean ? "" : prev.visa_type,
        visa_type_other: isKorean ? "" : prev.visa_type_other,
        visa_expiry: isKorean ? "" : prev.visa_expiry,
      };
    });
  };

  const removeCountry = (code: string) => {
    setState((prev) => {
      if (prev.nationalities.length <= 1) return prev;
      const nationalities = prev.nationalities.filter((item) => item.code !== code);
      const isKorean = nationalities.some(
        (item) => item.code === DEFAULT_COUNTRY_CODE,
      );
      return {
        ...prev,
        nationalities,
        nationality_code: nationalities[0].code,
        nationality: nationalities[0].label,
        is_korean_national: isKorean,
        has_visa: isKorean ? null : prev.has_visa,
        visa_type: isKorean ? "" : prev.visa_type,
        visa_type_other: isKorean ? "" : prev.visa_type_other,
        visa_expiry: isKorean ? "" : prev.visa_expiry,
      };
    });
  };

  const setHasVisa = (val: boolean) => {
    setState((prev) => ({
      ...prev,
      has_visa: val,
      // 비자 없음으로 바꾸면 종류·만료 초기화
      visa_type: val ? prev.visa_type : "",
      visa_type_other: val ? prev.visa_type_other : "",
      visa_expiry: val ? prev.visa_expiry : "",
    }));
  };

  const setVisaType = (code: string) => {
    setState((prev) => ({
      ...prev,
      visa_type: code,
      visa_type_other: code === "OTHER" ? prev.visa_type_other : "",
    }));
  };

  const isForeign = !state.is_korean_national;
  const reachedNationalityLimit = state.nationalities.length >= MAX_NATIONALITIES;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 국적 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink-2">
          국적<span className="ml-1 text-destructive">*</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {state.nationalities.map((item) => (
            <span
              key={item.code}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {item.label}
              {state.nationalities.length > 1 ? (
                <button
                  type="button"
                  aria-label={`${item.label} 삭제`}
                  onClick={() => removeCountry(item.code)}
                  className="text-primary/70 hover:text-primary"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {reachedNationalityLimit ? (
          <p className="rounded-lg border border-hairline-2 bg-secondary/50 px-3 py-2 text-xs text-ink-3">
            국적은 최대 {MAX_NATIONALITIES}개까지 저장할 수 있습니다.
          </p>
        ) : (
          <SearchableSelect
            options={COUNTRY_OPTIONS.filter(
              (option) => !state.nationalities.some((item) => item.code === option.value),
            )}
            value={null}
            onChange={setCountry}
            ariaLabel="국적 선택"
            placeholder="국적 추가"
            searchPlaceholder="국가명 검색 (한글/영문)"
          />
        )}
        <p className="text-xs text-ink-3">
          복수 국적이면 모두 선택할 수 있습니다. 국적은 공개 프로필에 표시되지 않습니다.
        </p>
      </div>

      {/* 외국인: 비자 */}
      {isForeign ? (
        <div className="flex flex-col gap-4 rounded-lg border border-hairline-2 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            체류 자격 (비자)
          </p>

          {/* 비자 유무 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-2">
              한국 체류 비자가 있나요?
              <span className="ml-1 text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              {[
                { val: true, label: "있음" },
                { val: false, label: "없음 / 신청 예정" },
              ].map((opt) => (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => setHasVisa(opt.val)}
                  className={cn(
                    "flex-1 rounded-lg border py-3 text-sm font-medium transition-colors",
                    state.has_visa === opt.val
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-hairline-2 text-ink-2 hover:bg-secondary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 비자 종류 + 만료일 */}
          {state.has_visa === true ? (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-ink-2">비자 종류</label>
                <SearchableSelect
                  options={VISA_OPTIONS}
                  value={state.visa_type || null}
                  onChange={setVisaType}
                  ariaLabel="비자 종류 선택"
                  placeholder="비자 종류 선택"
                  searchPlaceholder="비자 코드/명칭 검색 (예: E-6)"
                />
                {state.visa_type === "OTHER" ? (
                  <input
                    type="text"
                    value={state.visa_type_other}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, visa_type_other: e.target.value }))
                    }
                    maxLength={80}
                    placeholder="비자 종류를 직접 입력하세요"
                    className="h-11 w-full rounded-lg border border-hairline-2 bg-surface-2 px-4 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none"
                  />
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-ink-2">비자 만료일</label>
                <input
                  type="date"
                  value={state.visa_expiry}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, visa_expiry: e.target.value }))
                  }
                  className="h-11 w-full rounded-lg border border-hairline-2 bg-surface-2 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* form action 용 hidden inputs */}
      {emitHiddenInputs ? (
        <>
          <input
            type="hidden"
            name="nationalities_json"
            value={JSON.stringify(state.nationalities)}
          />
          <input type="hidden" name="nationality_code" value={state.nationality_code} />
          <input type="hidden" name="nationality" value={state.nationality} />
          <input
            type="hidden"
            name="is_korean_national"
            value={state.is_korean_national ? "true" : "false"}
          />
          <input
            type="hidden"
            name="has_visa"
            value={state.has_visa == null ? "" : state.has_visa ? "true" : "false"}
          />
          <input type="hidden" name="visa_type" value={state.visa_type} />
          <input type="hidden" name="visa_type_other" value={state.visa_type_other} />
          <input type="hidden" name="visa_expiry" value={state.visa_expiry} />
        </>
      ) : null}
    </div>
  );
}

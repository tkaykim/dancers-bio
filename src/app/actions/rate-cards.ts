"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_SERVICE_TYPES,
  CURRENCIES,
  isCountryService,
  type RateServiceType,
} from "@/lib/validation/rate-cards";
import type { ActionResult } from "./auth";

/**
 * 단가 작업 대상 댄서 결정 (careers.ts와 동일 패턴).
 * form의 dancer_id 우선(소유자/매니저/관리자 확인), 없으면 본인 첫 댄서.
 */
async function resolveTargetDancer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<
  | { ok: true; dancer: { id: string; profile_id: string | null } }
  | { ok: false; error: string }
> {
  const explicit = (formData.get("dancer_id") ?? "").toString().trim();

  if (explicit) {
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, profile_id")
      .eq("id", explicit)
      .maybeSingle();
    if (!dancer) return { ok: false, error: "댄서 프로필을 찾을 수 없습니다." };

    let allowed = dancer.profile_id === userId;
    if (!allowed) {
      const { data: mgr } = await supabase
        .from("dancer_managers")
        .select("dancer_id")
        .eq("dancer_id", dancer.id)
        .eq("manager_id", userId)
        .maybeSingle();
      allowed = Boolean(mgr);
    }
    if (!allowed) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, is_super_admin")
        .eq("id", userId)
        .maybeSingle();
      allowed = profile != null && isSuperAdmin(
        profile as { is_admin: boolean; is_super_admin: boolean },
      );
    }
    if (!allowed)
      return { ok: false, error: "이 댄서의 단가를 수정할 권한이 없습니다." };
    return { ok: true, dancer };
  }

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, profile_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "먼저 댄서 프로필을 만들어 주세요." };
  return { ok: true, dancer };
}

/** "" / null → null, 그 외 정수. 음수·비정상은 null. */
function intOrNull(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) ?? "").toString().trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function boolFrom(formData: FormData, key: string, fallback: boolean): boolean {
  const raw = formData.get(key);
  if (raw == null) return fallback;
  return raw === "true" || raw === "on";
}

type ParsedRate = {
  service_type: RateServiceType;
  country: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  is_negotiable: boolean;
  unit: string | null;
  note: string | null;
  is_public: boolean;
};

function parseRateForm(formData: FormData): ParsedRate | { error: string } {
  const service_type = (formData.get("service_type") ?? "").toString() as RateServiceType;
  if (!RATE_SERVICE_TYPES.includes(service_type))
    return { error: "서비스 종류를 선택해 주세요." };

  // 국가: 해외워크샵만 사용. 그 외는 강제 null. 빈 값 = 기본(폴백) 단가.
  let country: string | null = null;
  if (isCountryService(service_type)) {
    const raw = (formData.get("country") ?? "").toString().trim().toUpperCase();
    if (raw) {
      if (!/^[A-Z]{2}$/.test(raw))
        return { error: "국가코드는 2자리 영문입니다. (예: JP, US)" };
      country = raw;
    }
  }

  const currencyRaw = (formData.get("currency") ?? "KRW").toString();
  const currency = (CURRENCIES as readonly string[]).includes(currencyRaw)
    ? currencyRaw
    : "KRW";

  const price = intOrNull(formData, "price");
  const price_min = intOrNull(formData, "price_min");
  const price_max = intOrNull(formData, "price_max");
  if (price == null && price_min == null && price_max == null)
    return { error: "단가 또는 단가 범위를 하나 이상 입력해 주세요." };
  if (price_min != null && price_max != null && price_min > price_max)
    return { error: "단가 범위 하한이 상한보다 큽니다." };

  const unit = (formData.get("unit") ?? "").toString().trim().slice(0, 40) || null;
  const note = (formData.get("note") ?? "").toString().trim().slice(0, 500) || null;

  return {
    service_type,
    country,
    price,
    price_min,
    price_max,
    currency,
    is_negotiable: boolFrom(formData, "is_negotiable", true),
    unit,
    note,
    is_public: boolFrom(formData, "is_public", true),
  };
}

/**
 * 단가 카드 저장 (upsert by 자연키 dancer_id+service_type+country).
 * 같은 서비스·같은 국가 행이 있으면 덮어쓰고, 없으면 새로 만든다.
 * 국가를 바꾸려면 = 다른 행이 되므로, 수정 모달에서는 국가를 고정한다.
 */
export async function upsertRateCardAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const parsed = parseRateForm(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const { error } = await supabase.from("dancer_rate_cards").upsert(
    {
      dancer_id: target.dancer.id,
      service_type: parsed.service_type,
      country: parsed.country,
      price: parsed.price,
      price_min: parsed.price_min,
      price_max: parsed.price_max,
      currency: parsed.currency,
      is_negotiable: parsed.is_negotiable,
      unit: parsed.unit,
      note: parsed.note,
      is_public: parsed.is_public,
    },
    { onConflict: "dancer_id,service_type,country" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/rates");
  return { ok: true };
}

export async function deleteRateCardAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const id = (formData.get("id") ?? "").toString().trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { error } = await supabase
    .from("dancer_rate_cards")
    .delete()
    .eq("id", id)
    .eq("dancer_id", target.dancer.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/rates");
  return { ok: true };
}

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import {
  TOP_SIZES,
  WAIST_MIN,
  WAIST_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
} from "@/lib/fit/sizes";
import type { ActionResult } from "./auth";

function pick(v: FormDataEntryValue | null, allowed: string[]): string | null {
  const t = (v ?? "").toString().trim();
  return allowed.includes(t) ? t : null;
}

// 드롭다운 추천 + 직접입력 공용: 숫자만 뽑아 범위 검증. 저장은 숫자 문자열("130").
function pickNum(
  v: FormDataEntryValue | null,
  min: number,
  max: number,
): string | null {
  const t = (v ?? "").toString().trim().replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= min && n <= max ? String(n) : null;
}

// 토큰 매직링크로 로그인 없이 상의·하의(허리/기장) 사이즈만 업데이트. 토큰이 dancer_id를 서명 보증.
export async function submitQuickFitAction(
  formData: FormData,
): Promise<ActionResult> {
  const token = (formData.get("token") ?? "").toString();
  const dancerId = verifyHeightToken(token);
  if (!dancerId)
    return { ok: false, error: "링크가 유효하지 않거나 만료되었습니다." };

  const top_size = pick(formData.get("top_size"), TOP_SIZES);
  const pants_waist_inch = pickNum(
    formData.get("pants_waist_inch"),
    WAIST_MIN,
    WAIST_MAX,
  );
  const pants_length_cm = pickNum(
    formData.get("pants_length_cm"),
    LENGTH_MIN,
    LENGTH_MAX,
  );
  if (!top_size || !pants_waist_inch || !pants_length_cm)
    return {
      ok: false,
      error: `상의 사이즈를 선택하고, 허리(${WAIST_MIN}~${WAIST_MAX}인치)·기장(${LENGTH_MIN}~${LENGTH_MAX}cm)을 숫자로 입력해 주세요.`,
    };

  const patch = { top_size, pants_waist_inch, pants_length_cm };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const { error } = existing
    ? await admin
        .from("dancer_private_info")
        .update(patch)
        .eq("dancer_id", dancerId)
    : await admin
        .from("dancer_private_info")
        .insert({ dancer_id: dancerId, ...patch });
  if (error)
    return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };
  return { ok: true };
}

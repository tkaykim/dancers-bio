"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

// 상의: 숫자(가슴둘레 호수)+영문 병기. 하의: 허리(인치)·기장(cm).
export const TOP_SIZES = [
  "85(XS)",
  "90(S)",
  "95(M)",
  "100(L)",
  "105(XL)",
  "110(XXL)",
  "115(3XL)",
];
export const WAIST_INCHES = [
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
];
export const LENGTH_CMS = ["85", "90", "95", "100", "105", "110", "115"];

function pick(v: FormDataEntryValue | null, allowed: string[]): string | null {
  const t = (v ?? "").toString().trim();
  return allowed.includes(t) ? t : null;
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
  const pants_waist_inch = pick(formData.get("pants_waist_inch"), WAIST_INCHES);
  const pants_length_cm = pick(formData.get("pants_length_cm"), LENGTH_CMS);
  if (!top_size || !pants_waist_inch || !pants_length_cm)
    return {
      ok: false,
      error: "상의 사이즈, 하의 허리·기장을 모두 선택해 주세요.",
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

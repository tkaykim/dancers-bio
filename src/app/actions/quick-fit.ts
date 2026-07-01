"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

function parseSize(v: FormDataEntryValue | null): string | null {
  const t = (v ?? "").toString().trim().toUpperCase();
  return SIZES.includes(t) ? t : null;
}

// 토큰 매직링크로 로그인 없이 상·하의 사이즈만 업데이트. 토큰이 dancer_id를 서명 보증.
export async function submitQuickFitAction(
  formData: FormData,
): Promise<ActionResult> {
  const token = (formData.get("token") ?? "").toString();
  const dancerId = verifyHeightToken(token);
  if (!dancerId)
    return { ok: false, error: "링크가 유효하지 않거나 만료되었습니다." };

  const top_size = parseSize(formData.get("top_size"));
  const bottom_size = parseSize(formData.get("bottom_size"));
  if (top_size == null || bottom_size == null)
    return { ok: false, error: "상의와 하의 사이즈를 모두 선택해 주세요." };

  const patch = { top_size, bottom_size };

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

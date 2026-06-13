"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

function parseNum(
  v: FormDataEntryValue | null,
  min: number,
  max: number,
): number | null {
  const t = (v ?? "").toString().trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// 토큰 매직링크로 로그인 없이 키·신발만 업데이트. 토큰이 dancer_id를 서명 보증.
export async function submitQuickHeightAction(
  formData: FormData,
): Promise<ActionResult> {
  const token = (formData.get("token") ?? "").toString();
  const dancerId = verifyHeightToken(token);
  if (!dancerId)
    return { ok: false, error: "링크가 유효하지 않거나 만료되었습니다." };

  const height_cm = parseNum(formData.get("height_cm"), 100, 250);
  const shoe_size_mm = parseNum(formData.get("shoe_size_mm"), 180, 330);
  if (height_cm == null && shoe_size_mm == null)
    return { ok: false, error: "키를 입력해 주세요. (cm)" };

  const patch: Record<string, number> = {};
  if (height_cm != null) patch.height_cm = height_cm;
  if (shoe_size_mm != null) patch.shoe_size_mm = shoe_size_mm;

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
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };
  return { ok: true };
}

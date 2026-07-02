"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth/guard";
import { verifyHeightToken } from "@/lib/quick-token";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
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

// 사이즈 파싱 + 저장 공용. dancerId는 호출부에서 신원확인(토큰 or 세션) 후 전달.
async function saveFit(
  dancerId: string,
  formData: FormData,
): Promise<ActionResult> {
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

// ① 토큰 매직링크(로그인 불필요). 토큰이 dancer_id를 서명 보증. /fit/<token>
export async function submitQuickFitAction(
  formData: FormData,
): Promise<ActionResult> {
  const token = (formData.get("token") ?? "").toString();
  const dancerId = verifyHeightToken(token);
  if (!dancerId)
    return { ok: false, error: "링크가 유효하지 않거나 만료되었습니다." };
  return saveFit(dancerId, formData);
}

// ② 로그인 세션 공유링크. code=프로젝트 short_code, 세션으로 본인 댄서 식별. /fr/<code>
export async function submitFitBySessionAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const code = (formData.get("code") ?? "").toString().trim();
  if (!code) return { ok: false, error: "잘못된 링크입니다." };
  const admin = createAdminClient();
  const { data: proj } = await admin
    .from("projects")
    .select("id")
    .eq("short_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proj) return { ok: false, error: "잘못된 링크입니다." };
  const dancerId = await resolveDancerIdForUserInProject(
    proj.id as string,
    user.id,
  );
  if (!dancerId)
    return {
      ok: false,
      error: "이 프로젝트에 지원한 기록이 없어요. 지원하신 계정으로 로그인해 주세요.",
    };
  return saveFit(dancerId, formData);
}

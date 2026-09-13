"use server";

import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/utils/slug";
import { isVanityNickname } from "@/lib/utils/vanity-nickname";

type Target = "dancers" | "teams";

type CheckResult =
  | { ok: true; available: true; slug: string }
  | { ok: true; available: false; slug: string; suggestion: string }
  | { ok: false; error: string };

/**
 * 입력 슬러그의 가용성을 확인. 점유돼 있으면 자동 대안 제안.
 * - `target`은 'dancers' | 'teams'
 * - `excludeId`는 자기 자신 (편집 모드) 제외용
 */
export async function checkSlugAvailability(
  input: string,
  target: Target,
  excludeId?: string | null,
): Promise<CheckResult> {
  await requireUser();
  if (target !== "dancers" && target !== "teams") return { ok: false, error: "Invalid target" };
  const slug = (input ?? "").trim().toLowerCase();
  if (!slug) return { ok: false, error: "slug가 비어있습니다." };
  if (!(target === "dancers" ? isVanityNickname(slug) : isValidSlug(slug))) {
    return {
      ok: false,
      error: "영문 소문자/숫자/하이픈만, 2~40자.",
    };
  }
  const supabase = await createClient();
  // The RPC checks occupied names even when the other profile is hidden by RLS.
  const { data: suggestion, error } = await supabase.rpc("next_available_slug", {
    base: slug,
    target_table: target,
    exclude_id: excludeId ?? null,
  });
  if (error || !suggestion) return { ok: false, error: "주소를 확인하지 못했습니다. 다시 시도해 주세요." };
  if (suggestion === slug) return { ok: true, available: true, slug };
  return {
    ok: true,
    available: false,
    slug,
    suggestion: (suggestion as string | null) ?? `${slug}-2`,
  };
}

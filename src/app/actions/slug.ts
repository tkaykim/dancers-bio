"use server";

import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/utils/slug";

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
  const slug = (input ?? "").trim().toLowerCase();
  if (!slug) return { ok: false, error: "slug가 비어있습니다." };
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "영문 소문자/숫자/하이픈만, 2~40자.",
    };
  }
  const supabase = await createClient();
  const { data: taken } = await supabase
    .from(target)
    .select("id")
    .eq("slug", slug)
    .neq("id", excludeId ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  if (!taken) return { ok: true, available: true, slug };

  // 충돌 시 대안 (DB 함수 사용)
  const { data: suggestion } = await supabase.rpc("next_available_slug", {
    base: slug,
    target_table: target,
    exclude_id: excludeId ?? null,
  });
  return {
    ok: true,
    available: false,
    slug,
    suggestion: (suggestion as string | null) ?? `${slug}-2`,
  };
}

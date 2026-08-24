import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// 풀(수주액·유보·staff/referral 분배) 권한 — 설계 정본 docs/design-staff-settlement-pool.md §4.3.
// admin, 또는 (프로젝트 owner AND staff_pool_enabled). 공동관리자는 제외 — 본인 몫만 본다.

export async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

export async function canManagePool(
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  const admin = createAdminClient();
  const [{ data: proj }, { data: fin }] = await Promise.all([
    admin.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    admin
      .from("project_finances")
      .select("staff_pool_enabled")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  return (
    (proj?.owner_id as string | undefined) === userId &&
    fin?.staff_pool_enabled === true
  );
}

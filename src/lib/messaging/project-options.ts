import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MessageProject = { id: string; title: string };

/** Only return projects this authenticated profile owns or manages. */
export async function listMessageProjects(profile: { id: string; is_admin: boolean }): Promise<MessageProject[]> {
  const admin = createAdminClient();
  let query = admin.from("projects").select("id, title").is("deleted_at", null);
  if (!profile.is_admin) {
    const { data: memberships, error } = await admin.from("project_managers")
      .select("project_id").eq("profile_id", profile.id);
    if (error) throw new Error("프로젝트 권한을 확인하지 못했습니다.");
    const ids = (memberships ?? []).map((m) => m.project_id);
    query = ids.length
      ? query.or(`owner_id.eq.${profile.id},id.in.(${ids.join(",")})`)
      : query.eq("owner_id", profile.id);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error("프로젝트를 불러오지 못했습니다.");
  return (data ?? []).map((p) => ({ id: p.id, title: p.title || "프로젝트" }));
}

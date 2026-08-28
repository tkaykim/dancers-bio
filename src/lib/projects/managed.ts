import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ManagedProject = {
  id: string;
  short_code: string | null;
  title: string;
  status: string;
  application_deadline: string | null;
};

// 소유(owner_id) + 공동관리(project_managers) 공고 합본.
//
// project_managers 는 권한 판정(canManageProject)에만 쓰이고 다른 목록 화면이 없다.
// 공고가 마감되면 피드에서도 사라지므로, 담당자가 자기 공고를 다시 찾는 유일한 경로가
// 이 목록(/me/projects)이다.
export async function listManagedProjects(userId: string): Promise<ManagedProject[]> {
  const supabase = await createClient();
  const { data: managerRows } = await supabase
    .from("project_managers")
    .select("project_id")
    .eq("profile_id", userId);
  const managedIds = (managerRows ?? []).map((r) => r.project_id as string);

  const { data: rows } = await supabase
    .from("projects")
    .select("id, short_code, title, status, application_deadline")
    .is("deleted_at", null)
    .or(
      managedIds.length > 0
        ? `owner_id.eq.${userId},id.in.(${managedIds.join(",")})`
        : `owner_id.eq.${userId}`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  return (rows ?? []) as ManagedProject[];
}

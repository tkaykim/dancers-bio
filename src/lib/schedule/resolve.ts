import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 로그인한 사용자가 이 프로젝트의 지원자인지 확인하고, 매칭되는 dancer_id를 반환.
// 단톡방 공유 일정 링크(/sr)에서 이메일 입력 없이 세션으로 신원확인하기 위함.
// 매칭 순서: ① 본인 계정(applicant_id)으로 한 지원 → ② 본인이 클레임한 댄서로 들어온 지원.
export async function resolveDancerIdForUserInProject(
  projectId: string,
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();

  // ① 본인 계정으로 직접 지원한 건 (탈락자는 일정조사 대상에서 제외)
  const { data: app } = await admin
    .from("applications")
    .select("dancer_id")
    .eq("project_id", projectId)
    .eq("applicant_id", userId)
    .not("dancer_id", "is", null)
    .neq("status", "rejected")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (app?.dancer_id) return app.dancer_id as string;

  // ② 본인이 클레임한 댄서(profile_id=userId)로 들어온 지원(다이렉트 제안 포함)
  const { data: myDancers } = await admin
    .from("dancers")
    .select("id")
    .eq("profile_id", userId);
  const ids = (myDancers ?? []).map((d: { id: string }) => d.id);
  if (ids.length > 0) {
    const { data: app2 } = await admin
      .from("applications")
      .select("dancer_id")
      .eq("project_id", projectId)
      .in("dancer_id", ids)
      .neq("status", "rejected")
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (app2?.dancer_id) return app2.dancer_id as string;
  }

  return null;
}

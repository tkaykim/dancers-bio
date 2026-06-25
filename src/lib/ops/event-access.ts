import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProject, getUser } from "@/lib/auth/guard";

export type EventOpsAccess = {
  event: { id: string; project_id: string; ops_code: string };
  userId: string;
  authorized: boolean;
};

// 운영보드 접근 판정 (로그인 강제, 권한은 자세). 통과 조건 = 프로젝트 관리권한 OR 미만료 현장 스태프.
// 비로그인 → redirect(login). unauthorized여도 throw하지 않고 authorized=false 반환한다.
// (콘솔은 이걸로 '권한 신청' 화면을 분기. passes 등은 아래 requireEventOpsAccess로 404 처리.)
export async function getEventOpsAccess(opsCode: string): Promise<EventOpsAccess> {
  const code = (opsCode ?? "").trim();
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("project_events")
    .select("id, project_id, ops_code")
    .eq("ops_code", code)
    .maybeSingle();
  if (!ev) notFound();
  const event = {
    id: ev.id as string,
    project_id: ev.project_id as string,
    ops_code: ev.ops_code as string,
  };

  const user = await getUser();
  if (!user) {
    let next = `/ops/events/${code}`;
    try {
      const h = await headers();
      next = h.get("x-pathname") ?? next;
    } catch {
      // 헤더 접근 불가 시 콘솔 경로로 폴백
    }
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  let authorized = await canManageProject(event.project_id);
  if (!authorized) {
    const { data: staffRow } = await admin
      .from("event_staff")
      .select("id, expires_at")
      .eq("event_id", event.id)
      .eq("profile_id", user.id)
      .maybeSingle();
    authorized =
      !!staffRow &&
      (!staffRow.expires_at ||
        new Date(staffRow.expires_at as string) > new Date());
  }

  return { event, userId: user.id, authorized };
}

// staff-facing 페이지(passes 등) 게이트: 권한 없으면 notFound 로 흐름 종료.
export async function requireEventOpsAccess(
  opsCode: string,
): Promise<{ id: string; project_id: string }> {
  const access = await getEventOpsAccess(opsCode);
  if (!access.authorized) notFound();
  return { id: access.event.id, project_id: access.event.project_id };
}

import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProject, getUser } from "@/lib/auth/guard";

// 운영보드 staff-facing 페이지(콘솔 · passes 등) 공통 접근 게이트.
// 통과 조건 = 로그인 + (프로젝트 관리권한 OR 미만료 현장 스태프).
// 통과 못하면 redirect(login) 또는 notFound() 로 렌더 흐름을 종료한다.
// (참가자용 셀프패스 /pass 는 별도 인증 모델이므로 이 게이트를 쓰지 않는다.)
export async function requireEventOpsAccess(
  opsCode: string,
): Promise<{ id: string; project_id: string }> {
  const code = (opsCode ?? "").trim();
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("project_events")
    .select("id, project_id")
    .eq("ops_code", code)
    .maybeSingle();
  if (!ev) notFound();
  const event = { id: ev.id as string, project_id: ev.project_id as string };

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

  if (await canManageProject(event.project_id)) return event;

  const { data: staffRow } = await admin
    .from("event_staff")
    .select("id, expires_at")
    .eq("event_id", event.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  const active =
    !!staffRow &&
    (!staffRow.expires_at ||
      new Date(staffRow.expires_at as string) > new Date());
  if (active) return event;

  notFound();
}

"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

type AdminClient = ReturnType<typeof createAdminClient>;

// 날짜 입력(YYYY-MM-DD)은 "그 날까지 유효" = 당일 23:59:59 KST 만료로 저장.
// 빈 값이면 무기한(null).
function toExpiry(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T23:59:59+09:00`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function resolveEventProject(
  admin: AdminClient,
  eventId: string,
): Promise<{ id: string; project_id: string; ops_code: string } | null> {
  const { data } = await admin
    .from("project_events")
    .select("id, project_id, ops_code")
    .eq("id", eventId)
    .maybeSingle();
  return (
    (data as { id: string; project_id: string; ops_code: string } | null) ?? null
  );
}

// 현장 스태프 관리 권한 = 프로젝트 관리권한(소유자·슈퍼관리자·매니저).
async function authorizeStaffManage(
  admin: AdminClient,
  eventId: string,
): Promise<
  | { ok: true; event: { id: string; project_id: string; ops_code: string } }
  | { ok: false; error: string }
> {
  const ev = await resolveEventProject(admin, eventId);
  if (!ev) return { ok: false, error: "운영일정을 찾을 수 없습니다." };
  if (!(await canManageProject(ev.project_id)))
    return { ok: false, error: "현장 스태프를 관리할 권한이 없습니다." };
  return { ok: true, event: ev };
}

export type OpsStaffCandidate = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
  email: string | null;
  phone: string | null;
};

// 현장 스태프로 등록할 "기존 가입 계정" 검색 (이름·전화·이메일·인스타). 관리권한자만.
export async function searchOpsStaffCandidatesAction(
  query: string,
  eventId: string,
): Promise<ActionResult<OpsStaffCandidate[]>> {
  await requireUser();
  const admin = createAdminClient();
  const auth = await authorizeStaffManage(admin, eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const term = (query ?? "").trim();
  if (term.length < 1) return { ok: true, data: [] };
  const safe = term.replace(/[%_,]/g, "");
  if (!safe) return { ok: true, data: [] };
  const { data, error } = await admin.rpc("admin_search_ops_staff_candidates", {
    p_term: safe,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as OpsStaffCandidate[] };
}

// 현장 스태프 등록 (기본 무기한).
export async function addEventStaffAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const eventId = (formData.get("event_id") ?? "").toString().trim();
  const profileId = (formData.get("profile_id") ?? "").toString().trim();
  const role = ((formData.get("role") ?? "").toString().trim() || "staff").slice(0, 40);
  const expiresAt = toExpiry((formData.get("expires_at") ?? "").toString());
  if (!eventId || !profileId) return { ok: false, error: "잘못된 요청입니다." };
  if (!expiresAt) return { ok: false, error: "권한 만료일을 지정해 주세요." };

  const admin = createAdminClient();
  const auth = await authorizeStaffManage(admin, eventId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await admin.from("event_staff").insert({
    event_id: eventId,
    profile_id: profileId,
    role,
    expires_at: expiresAt,
    added_by: user.id,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "이미 등록된 스태프입니다." };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/ops/events/${auth.event.ops_code}`);
  return { ok: true };
}

// 현장 스태프 수정 (만료일자·역할).
export async function updateEventStaffAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const staffId = (formData.get("staff_id") ?? "").toString().trim();
  const eventId = (formData.get("event_id") ?? "").toString().trim();
  if (!staffId || !eventId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const auth = await authorizeStaffManage(admin, eventId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const update: { expires_at: string | null; role?: string } = {
    expires_at: toExpiry((formData.get("expires_at") ?? "").toString()),
  };
  const role = (formData.get("role") ?? "").toString().trim();
  if (role) update.role = role.slice(0, 40);

  const { error } = await admin
    .from("event_staff")
    .update(update)
    .eq("id", staffId)
    .eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/ops/events/${auth.event.ops_code}`);
  return { ok: true };
}

// 현장 스태프 삭제.
export async function removeEventStaffAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const staffId = (formData.get("staff_id") ?? "").toString().trim();
  const eventId = (formData.get("event_id") ?? "").toString().trim();
  if (!staffId || !eventId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const auth = await authorizeStaffManage(admin, eventId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await admin
    .from("event_staff")
    .delete()
    .eq("id", staffId)
    .eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/ops/events/${auth.event.ops_code}`);
  return { ok: true };
}

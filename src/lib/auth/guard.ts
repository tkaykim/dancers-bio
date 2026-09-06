import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/safeRedirect";
import { isSuperAdmin } from "./super-admin";

export { isSuperAdmin } from "./super-admin";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function loginRedirectTarget(): Promise<string> {
  try {
    const h = await headers();
    const raw = h.get("x-pathname");
    const next = safeReturnTo(raw, "");
    if (!next || next.startsWith("/login") || next.startsWith("/signup")) {
      return "/login";
    }
    return `/login?next=${encodeURIComponent(next)}`;
  } catch {
    return "/login";
  }
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect(await loginRedirectTarget());
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, bio, can_create_project, is_admin, is_super_admin, is_verified_badge, instagram_handle, instagram_verified_at",
    )
    .eq("id", user.id)
    .single();
  return profile as
    | (typeof profile & {
        is_super_admin: boolean;
        instagram_handle: string | null;
        instagram_verified_at: string | null;
      })
    | null;
}

export async function requireProfile() {
  const profile = await getProfile();
  if (!profile) redirect(await loginRedirectTarget());
  return profile;
}

export async function requireCreator() {
  const profile = await requireProfile();
  if (!profile.can_create_project && !profile.is_admin) {
    redirect("/me?creator_required=1");
  }
  return profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();
  if (!profile.is_admin) {
    redirect("/me?admin_required=1");
  }
  return profile;
}

export async function requireSuperAdmin() {
  const profile = await requireProfile();
  if (!isSuperAdmin(profile)) {
    redirect("/admin?super_required=1");
  }
  return profile;
}

// 이 프로젝트를 "관리"할 수 있는가 = 소유자 OR 운영 관리자(is_admin) OR 공동관리자.
// DB의 can_manage_project(p_id) (SECURITY DEFINER) 를 그대로 호출 — RLS와 동일 판정.
export async function canManageProject(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_manage_project", { p_id: projectId });
  return data === true;
}

// 소유자 OR 운영 관리자만(공동관리자 제외) — 삭제·공동관리자 추가/삭제 같은 권한 게이트용.
export async function isProjectOwnerOrAdmin(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_project_owner", { p_id: projectId });
  return data === true;
}

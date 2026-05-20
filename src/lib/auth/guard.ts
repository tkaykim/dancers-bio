import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/safeRedirect";

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
      "id, display_name, avatar_url, bio, can_create_project, is_admin, is_verified_badge, instagram_handle, instagram_verified_at",
    )
    .eq("id", user.id)
    .single();
  return profile as
    | (typeof profile & {
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

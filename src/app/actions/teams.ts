"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  addMemberSchema,
  teamProfileSchema,
  transferLeadSchema,
} from "@/lib/validation/teams";
import type { ActionResult } from "./auth";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

function arrayFromForm(formData: FormData, key: string): string[] {
  const raw = (formData.get(key) ?? "").toString();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildSocialLinks(parsed: {
  social_instagram?: string | null;
  social_youtube?: string | null;
  social_tiktok?: string | null;
}) {
  const links: Record<string, string> = {};
  if (parsed.social_instagram) links.instagram = parsed.social_instagram;
  if (parsed.social_youtube) links.youtube = parsed.social_youtube;
  if (parsed.social_tiktok) links.tiktok = parsed.social_tiktok;
  return Object.keys(links).length > 0 ? links : null;
}

function humanizeTeamError(message: string): string {
  if (message.includes("teams_slug_key") || (message.toLowerCase().includes("duplicate") && message.includes("slug"))) {
    return "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.";
  }
  if (message.includes("team_members_team_profile_unique")) {
    return "이미 등록된 멤버입니다.";
  }
  if (message.includes("Cannot remove team lead")) {
    return "팀장은 멤버에서 직접 제외할 수 없습니다. 팀장을 이양하거나 팀을 해체하세요.";
  }
  return message;
}

export async function createTeamAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!dancer) {
    return { ok: false, error: "팀을 만들려면 먼저 댄서 프로필이 필요합니다." };
  }

  const parsed = teamProfileSchema.safeParse({
    team_name: formData.get("team_name"),
    korean_name: strOrNull(formData, "korean_name"),
    slug: strOrNull(formData, "slug"),
    bio: strOrNull(formData, "bio"),
    location: strOrNull(formData, "location"),
    specialties: arrayFromForm(formData, "specialties"),
    genres: arrayFromForm(formData, "genres"),
    social_instagram: strOrNull(formData, "social_instagram"),
    social_youtube: strOrNull(formData, "social_youtube"),
    social_tiktok: strOrNull(formData, "social_tiktok"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const social_links = buildSocialLinks(parsed.data);

  const insertValues = {
    team_name: parsed.data.team_name,
    korean_name: parsed.data.korean_name ?? null,
    slug: parsed.data.slug ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
    lead_profile_id: user.id,
  };

  const { data: created, error } = await supabase
    .from("teams")
    .insert(insertValues)
    .select("id")
    .single();
  if (error) return { ok: false, error: humanizeTeamError(error.message) };
  const teamId = created.id as string;

  const profileImg = formData.get("profile_img");
  if (profileImg instanceof File && profileImg.size > 0) {
    if (
      profileImg.size <= MAX_AVATAR_BYTES &&
      ALLOWED_AVATAR_TYPES.includes(profileImg.type)
    ) {
      const ext = profileImg.type.split("/")[1] ?? "jpg";
      const path = `${teamId}/profile_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(path, profileImg, { upsert: true, contentType: profileImg.type });
      if (!uploadError) {
        const { data: pub } = supabase.storage
          .from("profile-photos")
          .getPublicUrl(path);
        await supabase
          .from("teams")
          .update({ profile_img: pub.publicUrl })
          .eq("id", teamId);
      }
    }
  }

  revalidatePath("/me/teams");
  revalidatePath("/me");
  return { ok: true, data: { id: teamId } };
}

export async function updateTeamAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const supabase = await createClient();

  const teamId = (formData.get("team_id") ?? "").toString();
  if (!teamId) return { ok: false, error: "잘못된 요청입니다." };

  const parsed = teamProfileSchema.safeParse({
    team_name: formData.get("team_name"),
    korean_name: strOrNull(formData, "korean_name"),
    slug: strOrNull(formData, "slug"),
    bio: strOrNull(formData, "bio"),
    location: strOrNull(formData, "location"),
    specialties: arrayFromForm(formData, "specialties"),
    genres: arrayFromForm(formData, "genres"),
    social_instagram: strOrNull(formData, "social_instagram"),
    social_youtube: strOrNull(formData, "social_youtube"),
    social_tiktok: strOrNull(formData, "social_tiktok"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const social_links = buildSocialLinks(parsed.data);

  const baseValues = {
    team_name: parsed.data.team_name,
    korean_name: parsed.data.korean_name ?? null,
    slug: parsed.data.slug ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
  };

  const { error } = await supabase
    .from("teams")
    .update(baseValues)
    .eq("id", teamId);
  if (error) return { ok: false, error: humanizeTeamError(error.message) };

  const profileImg = formData.get("profile_img");
  if (profileImg instanceof File && profileImg.size > 0) {
    if (profileImg.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "이미지는 5MB 이하만 업로드할 수 있습니다." };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(profileImg.type)) {
      return { ok: false, error: "JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다." };
    }
    const ext = profileImg.type.split("/")[1] ?? "jpg";
    const path = `${teamId}/profile_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, profileImg, { upsert: true, contentType: profileImg.type });
    if (uploadError) {
      return { ok: false, error: `이미지 업로드 실패: ${uploadError.message}` };
    }
    const { data: pub } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(path);
    await supabase
      .from("teams")
      .update({ profile_img: pub.publicUrl })
      .eq("id", teamId);
  }

  revalidatePath(`/me/teams/${teamId}`);
  revalidatePath("/me/teams");
  if (parsed.data.slug) revalidatePath(`/t/${parsed.data.slug}`);
  revalidatePath(`/t/${teamId}`);
  return { ok: true, data: { id: teamId } };
}

export async function addTeamMemberAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const supabase = await createClient();

  const parsed = addMemberSchema.safeParse({
    team_id: formData.get("team_id"),
    profile_id: strOrNull(formData, "profile_id"),
    display_name: strOrNull(formData, "display_name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const { data, error } = await supabase
    .from("team_members")
    .insert({
      team_id: parsed.data.team_id,
      profile_id: parsed.data.profile_id ?? null,
      display_name: parsed.data.display_name ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: humanizeTeamError(error.message) };

  revalidatePath(`/me/teams/${parsed.data.team_id}/members`);
  revalidatePath(`/me/teams/${parsed.data.team_id}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function removeTeamMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const memberId = (formData.get("member_id") ?? "").toString();
  const teamId = (formData.get("team_id") ?? "").toString();
  if (!memberId || !teamId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", teamId);
  if (error) return { ok: false, error: humanizeTeamError(error.message) };

  revalidatePath(`/me/teams/${teamId}/members`);
  revalidatePath(`/me/teams/${teamId}`);
  return { ok: true };
}

export async function transferTeamLeadAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const parsed = transferLeadSchema.safeParse({
    team_id: formData.get("team_id"),
    new_lead_profile_id: formData.get("new_lead_profile_id"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
    };
  }

  // Ensure the new lead is already a member of this team
  const { data: member } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", parsed.data.team_id)
    .eq("profile_id", parsed.data.new_lead_profile_id)
    .maybeSingle();
  if (!member) {
    return {
      ok: false,
      error: "후임은 팀의 기존 멤버여야 합니다 (플랫폼 계정 연결 필요).",
    };
  }

  const { error } = await supabase
    .from("teams")
    .update({ lead_profile_id: parsed.data.new_lead_profile_id })
    .eq("id", parsed.data.team_id);
  if (error) return { ok: false, error: humanizeTeamError(error.message) };

  revalidatePath(`/me/teams/${parsed.data.team_id}`);
  revalidatePath("/me/teams");
  return { ok: true };
}

export async function disbandTeamAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const teamId = (formData.get("team_id") ?? "").toString();
  if (!teamId) return { ok: false, error: "잘못된 요청입니다." };

  // Soft delete: mark inactive + archive open applications under this team
  const { error: teamError } = await supabase
    .from("teams")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", teamId);
  if (teamError) return { ok: false, error: humanizeTeamError(teamError.message) };

  await supabase
    .from("applications")
    .update({ archived_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .is("archived_at", null);

  revalidatePath("/me/teams");
  revalidatePath(`/me/teams/${teamId}`);
  return { ok: true };
}

export async function lookupProfileByEmailAction(
  email: string,
): Promise<ActionResult<{ id: string; display_name: string } | null>> {
  await requireUser();
  const supabase = await createClient();
  // Email is in auth.users which is not directly exposed via PostgREST.
  // For MVP we instead let the lead enter the user's display_name search:
  // simple fuzzy search on profiles.display_name.
  const term = email.trim();
  if (!term) return { ok: true, data: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", `%${term}%`)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

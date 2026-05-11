"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_AVATAR_TYPES as SHARED_AVATAR_TYPES,
  MAX_AVATAR_BYTES as SHARED_MAX_AVATAR_BYTES,
} from "@/lib/storage/profile-photos";
import { buildSocialUrl } from "@/lib/utils/social";
import {
  addMemberSchema,
  teamProfileSchema,
  transferLeadSchema,
} from "@/lib/validation/teams";
import type { ActionResult } from "./auth";

// 댄서 프로필 사진과 동일한 제약 사용 (이전엔 5MB로 불일치)
const MAX_AVATAR_BYTES = SHARED_MAX_AVATAR_BYTES;
const ALLOWED_AVATAR_TYPES = SHARED_AVATAR_TYPES;
const MAX_AVATAR_MB = Math.round(MAX_AVATAR_BYTES / (1024 * 1024));

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
  // 댄서 폼과 동일하게 핸들/URL 둘 다 받아 정규화된 URL로 저장
  const links: Record<string, string> = {};
  const ig = buildSocialUrl("instagram", parsed.social_instagram);
  const yt = buildSocialUrl("youtube", parsed.social_youtube);
  const tt = buildSocialUrl("tiktok", parsed.social_tiktok);
  if (ig) links.instagram = ig;
  if (yt) links.youtube = yt;
  if (tt) links.tiktok = tt;
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

  // slug 사전 체크: 팀 만들기 전에 중복 확인
  // (이전엔 insert 시점에 fail되어 빈 팀이 만들어진 후 에러 표시되는 버그)
  if (parsed.data.slug) {
    const { data: dup } = await supabase
      .from("teams")
      .select("id")
      .eq("slug", parsed.data.slug)
      .maybeSingle();
    if (dup) {
      return {
        ok: false,
        error: "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.",
      };
    }
  }

  // 사진 파일 사전 검증 (insert 전에 잡아서 팀 row가 만들어진 뒤 실패하는 일 방지)
  const profileImg = formData.get("profile_img");
  if (profileImg instanceof File && profileImg.size > 0) {
    if (profileImg.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: `팀 로고는 ${MAX_AVATAR_MB}MB 이하만 업로드할 수 있습니다.` };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(profileImg.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
      return { ok: false, error: "JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다." };
    }
  }

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

  if (profileImg instanceof File && profileImg.size > 0) {
    const ext = profileImg.type.split("/")[1] ?? "jpg";
    const path = `${teamId}/profile_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, profileImg, { upsert: true, contentType: profileImg.type });
    if (uploadError) {
      // 팀은 만들어졌지만 로고 업로드 실패 — 사용자에게 알려서 편집 페이지에서 재시도 유도
      revalidatePath("/me/teams");
      return {
        ok: false,
        error: `팀은 생성됐지만 로고 업로드 실패: ${uploadError.message}. 편집 페이지에서 다시 시도해 주세요.`,
      };
    }
    const { data: pub } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(path);
    await supabase
      .from("teams")
      .update({ profile_img: pub.publicUrl })
      .eq("id", teamId);
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

  // slug 사전 체크 (자기 자신 제외)
  if (parsed.data.slug) {
    const { data: dup } = await supabase
      .from("teams")
      .select("id")
      .eq("slug", parsed.data.slug)
      .neq("id", teamId)
      .maybeSingle();
    if (dup) {
      return {
        ok: false,
        error: "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.",
      };
    }
  }

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
      return { ok: false, error: `팀 로고는 ${MAX_AVATAR_MB}MB 이하만 업로드할 수 있습니다.` };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(profileImg.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
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

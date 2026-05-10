"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  dancerOnboardingSchema,
  dancerProfileSchema,
} from "@/lib/validation/portfolio";
import type { ActionResult } from "./auth";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function buildSocialLinksFromHandles(handles: {
  instagram?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
}) {
  const links: Record<string, string> = {};
  if (handles.instagram)
    links.instagram = `https://www.instagram.com/${handles.instagram}`;
  if (handles.youtube)
    links.youtube = `https://www.youtube.com/@${handles.youtube}`;
  if (handles.tiktok)
    links.tiktok = `https://www.tiktok.com/@${handles.tiktok}`;
  return Object.keys(links).length > 0 ? links : null;
}

function arrayFieldFromForm(formData: FormData, key: string): string[] {
  const all = formData.getAll(key);
  if (all.length > 1) {
    return all.map((v) => v.toString().trim()).filter(Boolean);
  }
  const raw = (formData.get(key) ?? "").toString().trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type DancerRow = {
  id: string;
  profile_id: string | null;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  gender: string | null;
  bio: string | null;
  location: string | null;
  specialties: string[] | null;
  genres: string[] | null;
  profile_img: string | null;
  social_links: Record<string, string> | null;
};

export async function getOwnDancerProfile(): Promise<DancerRow | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("dancers")
    .select(
      "id, profile_id, stage_name, korean_name, slug, gender, bio, location, specialties, genres, profile_img, social_links",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as DancerRow | null) ?? null;
}

function arrayFromForm(formData: FormData, key: string): string[] {
  const raw = (formData.get(key) ?? "").toString();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

function buildSocialLinks(parsed: { social_instagram?: string | null; social_youtube?: string | null; social_tiktok?: string | null }) {
  const links: Record<string, string> = {};
  if (parsed.social_instagram) links.instagram = parsed.social_instagram;
  if (parsed.social_youtube) links.youtube = parsed.social_youtube;
  if (parsed.social_tiktok) links.tiktok = parsed.social_tiktok;
  return Object.keys(links).length > 0 ? links : null;
}

export async function upsertDancerProfileAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = dancerProfileSchema.safeParse({
    stage_name: formData.get("stage_name"),
    korean_name: strOrNull(formData, "korean_name"),
    slug: strOrNull(formData, "slug"),
    gender: strOrNull(formData, "gender"),
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

  const supabase = await createClient();
  const existing = await supabase
    .from("dancers")
    .select("id, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const social_links = buildSocialLinks(parsed.data);

  const baseValues = {
    stage_name: parsed.data.stage_name,
    korean_name: parsed.data.korean_name ?? null,
    slug: parsed.data.slug ?? null,
    gender: parsed.data.gender ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
  };

  let dancerId: string;

  if (existing.data) {
    dancerId = existing.data.id;
    const { error } = await supabase
      .from("dancers")
      .update(baseValues)
      .eq("id", dancerId);
    if (error) return { ok: false, error: humanizeDancerError(error.message) };
  } else {
    const { data, error } = await supabase
      .from("dancers")
      .insert({ ...baseValues, profile_id: user.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: humanizeDancerError(error.message) };
    dancerId = data.id as string;
  }

  // Optional profile image upload
  const profileImg = formData.get("profile_img");
  if (profileImg instanceof File && profileImg.size > 0) {
    if (profileImg.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "이미지는 5MB 이하만 업로드할 수 있습니다." };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(profileImg.type)) {
      return { ok: false, error: "JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다." };
    }
    const ext = profileImg.type.split("/")[1] ?? "jpg";
    const path = `${dancerId}/profile_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, profileImg, { upsert: true, contentType: profileImg.type });
    if (uploadError) {
      return { ok: false, error: `이미지 업로드 실패: ${uploadError.message}` };
    }
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    const { error } = await supabase
      .from("dancers")
      .update({ profile_img: data.publicUrl })
      .eq("id", dancerId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/me/portfolio");
  if (parsed.data.slug) revalidatePath(`/d/${parsed.data.slug}`);
  revalidatePath(`/d/${dancerId}`);
  return { ok: true, data: { id: dancerId } };
}

function humanizeDancerError(message: string): string {
  if (message.includes("dancers_slug_key") || message.toLowerCase().includes("duplicate") && message.includes("slug")) {
    return "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.";
  }
  if (message.includes("dancers_profile_id_unique")) {
    return "이미 댄서 프로필이 존재합니다.";
  }
  return message;
}

export async function createDancerProfileAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = dancerOnboardingSchema.safeParse({
    stage_name: formData.get("stage_name"),
    korean_name: strOrNull(formData, "korean_name"),
    location: strOrNull(formData, "location"),
    gender: strOrNull(formData, "gender"),
    bio: strOrNull(formData, "bio"),
    specialties: arrayFieldFromForm(formData, "specialties"),
    genres: arrayFieldFromForm(formData, "genres"),
    social_instagram_handle: strOrNull(formData, "social_instagram_handle"),
    social_youtube_handle: strOrNull(formData, "social_youtube_handle"),
    social_tiktok_handle: strOrNull(formData, "social_tiktok_handle"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();
  const existing = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existing.data) {
    return { ok: false, error: "이미 댄서 프로필이 존재합니다." };
  }

  const social_links = buildSocialLinksFromHandles({
    instagram: parsed.data.social_instagram_handle ?? null,
    youtube: parsed.data.social_youtube_handle ?? null,
    tiktok: parsed.data.social_tiktok_handle ?? null,
  });

  const insertValues = {
    profile_id: user.id,
    stage_name: parsed.data.stage_name,
    korean_name: parsed.data.korean_name ?? null,
    gender: parsed.data.gender ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("dancers")
    .insert(insertValues)
    .select("id")
    .single();
  if (insertError) {
    return { ok: false, error: humanizeDancerError(insertError.message) };
  }
  const dancerId = inserted.id as string;

  const profileImg = formData.get("profile_img");
  if (profileImg instanceof File && profileImg.size > 0) {
    if (profileImg.size > MAX_AVATAR_BYTES) {
      return { ok: true, data: { id: dancerId } };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(profileImg.type)) {
      return { ok: true, data: { id: dancerId } };
    }
    const ext = profileImg.type.split("/")[1] ?? "jpg";
    const path = `${dancerId}/profile_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, profileImg, { upsert: true, contentType: profileImg.type });
    if (!uploadError) {
      const { data: pub } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(path);
      await supabase
        .from("dancers")
        .update({ profile_img: pub.publicUrl })
        .eq("id", dancerId);
    }
  }

  revalidatePath("/me/portfolio");
  revalidatePath("/me");
  return { ok: true, data: { id: dancerId } };
}

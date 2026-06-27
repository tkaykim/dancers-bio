"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { isValidProfilePhotoUrl } from "@/lib/storage/profile-photos";
import {
  DANCER_PORTFOLIO_BUCKET,
  ALLOWED_PORTFOLIO_FILE_TYPES,
  MAX_PORTFOLIO_FILE_BYTES,
  isValidPortfolioFileUrl,
} from "@/lib/storage/dancer-portfolio-file";
import { slugify } from "@/lib/utils/slug";
import { buildSocialUrl } from "@/lib/utils/social";
import {
  dancerOnboardingSchema,
  dancerProfileSchema,
} from "@/lib/validation/portfolio";
import type { ActionResult } from "./auth";

/**
 * 사용자 입력 슬러그가 비어있으면 stage_name 기반 자동 생성, 충돌 시 -2,-3.. 접미사.
 * DB의 next_available_slug() 함수가 충돌 회피를 처리.
 */
async function resolveSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userInputSlug: string | null,
  stageName: string,
  excludeDancerId: string | null,
): Promise<string | null> {
  const base = userInputSlug?.trim() || slugify(stageName);
  if (!base) return null;
  const { data } = await supabase.rpc("next_available_slug", {
    base,
    target_table: "dancers",
    exclude_id: excludeDancerId ?? null,
  });
  return (data as string | null) ?? null;
}

function buildSocialLinksFromHandles(handles: {
  instagram?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
}) {
  const links: Record<string, string> = {};
  const ig = buildSocialUrl("instagram", handles.instagram);
  const yt = buildSocialUrl("youtube", handles.youtube);
  const tt = buildSocialUrl("tiktok", handles.tiktok);
  if (ig) links.instagram = ig;
  if (yt) links.youtube = yt;
  if (tt) links.tiktok = tt;
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
  height_cm: number | null;
  shoe_size_mm: number | null;
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
  if (!data) return null;
  // 키·신발사이즈는 민감정보 테이블(dancer_private_info)에 별도 저장. 본인은 RLS로 조회 가능.
  const { data: priv } = await supabase
    .from("dancer_private_info")
    .select("height_cm, shoe_size_mm")
    .eq("dancer_id", (data as { id: string }).id)
    .maybeSingle();
  return {
    ...(data as Omit<DancerRow, "height_cm" | "shoe_size_mm">),
    height_cm: (priv?.height_cm as number | null) ?? null,
    shoe_size_mm: (priv?.shoe_size_mm as number | null) ?? null,
  };
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

// 숫자 측정값 파싱 — 범위 밖/빈값은 null.
function numInRange(formData: FormData, key: string, min: number, max: number): number | null {
  const v = (formData.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// dancer_private_info upsert — 주어진 patch만 반영(없는 키는 기존 값 유지). 비치명적.
// 본인/관리자는 RLS로 쓰기 가능.
async function upsertPrivateInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dancerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  try {
    const { data: existing } = await supabase
      .from("dancer_private_info")
      .select("dancer_id")
      .eq("dancer_id", dancerId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("dancer_private_info")
        .update(patch)
        .eq("dancer_id", dancerId);
    } else {
      await supabase
        .from("dancer_private_info")
        .insert({ dancer_id: dancerId, ...patch });
    }
  } catch (e) {
    console.error("[upsertPrivateInfo] 실패:", e);
  }
}

function measurementsFromForm(formData: FormData) {
  return {
    height_cm: numInRange(formData, "height_cm", 100, 250),
    shoe_size_mm: numInRange(formData, "shoe_size_mm", 180, 330),
  };
}

// 국적·비자 — 폼에 nationality_code가 있을 때만 반영.
// 한국 국적이면 비자 필드는 null로 정리. 외국인+비자있음일 때만 종류·만료 저장.
function nationalityVisaPatchFromForm(formData: FormData): Record<string, unknown> {
  const code = strOrNull(formData, "nationality_code");
  if (!code) return {};
  const isKorean = (formData.get("is_korean_national") ?? "").toString() === "true";
  const hasVisaRaw = (formData.get("has_visa") ?? "").toString();
  const hasVisa = hasVisaRaw === "true" ? true : hasVisaRaw === "false" ? false : null;
  const visaType = isKorean ? null : strOrNull(formData, "visa_type");
  const visaTypeOther =
    visaType === "OTHER" ? strOrNull(formData, "visa_type_other") : null;
  const expiry = strOrNull(formData, "visa_expiry");
  const visaExpiry =
    !isKorean && hasVisa === true && expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry)
      ? expiry
      : null;
  return {
    nationality_code: code,
    nationality: strOrNull(formData, "nationality"),
    is_korean_national: isKorean,
    has_visa: isKorean ? null : hasVisa,
    visa_type: visaType,
    visa_type_other: visaTypeOther,
    visa_expiry: visaExpiry,
  };
}

// 측정값(키·신발) + 국적·비자를 한 번에 upsert.
async function savePrivateInfoFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dancerId: string,
  formData: FormData,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  const m = measurementsFromForm(formData);
  if (m.height_cm != null) patch.height_cm = m.height_cm;
  if (m.shoe_size_mm != null) patch.shoe_size_mm = m.shoe_size_mm;
  Object.assign(patch, nationalityVisaPatchFromForm(formData));
  await upsertPrivateInfo(supabase, dancerId, patch);
}

function buildSocialLinks(parsed: { social_instagram?: string | null; social_youtube?: string | null; social_tiktok?: string | null }) {
  const links: Record<string, string> = {};
  const ig = buildSocialUrl("instagram", parsed.social_instagram);
  const yt = buildSocialUrl("youtube", parsed.social_youtube);
  const tt = buildSocialUrl("tiktok", parsed.social_tiktok);
  if (ig) links.instagram = ig;
  if (yt) links.youtube = yt;
  if (tt) links.tiktok = tt;
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
    profile_img_url: strOrNull(formData, "profile_img_url"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();
  const social_links = buildSocialLinks(parsed.data);

  let dancerId: string;
  const explicitDancerId = strOrNull(formData, "dancer_id");

  // slug 자동 생성/충돌 회피
  const resolvedSlug = await resolveSlug(
    supabase,
    parsed.data.slug ?? null,
    parsed.data.stage_name,
    explicitDancerId,
  );

  const baseValues = {
    stage_name: parsed.data.stage_name,
    korean_name: parsed.data.korean_name ?? null,
    slug: resolvedSlug,
    gender: parsed.data.gender ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
    ...(parsed.data.profile_img_url ? { profile_img: parsed.data.profile_img_url } : {}),
  };

  if (explicitDancerId) {
    // 편집 경로: 명시적 dancer_id로 소유자 또는 매니저 권한 확인 후 업데이트
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, profile_id")
      .eq("id", explicitDancerId)
      .maybeSingle();
    if (!dancer) return { ok: false, error: "댄서 프로필을 찾을 수 없습니다." };

    const isOwner = dancer.profile_id === user.id;
    let isManager = false;
    let isAdmin = false;
    if (!isOwner) {
      const { data: mgr } = await supabase
        .from("dancer_managers")
        .select("dancer_id")
        .eq("dancer_id", dancer.id)
        .eq("manager_id", user.id)
        .maybeSingle();
      isManager = Boolean(mgr);
      if (!isManager) {
        const { data: viewer } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        isAdmin = Boolean(viewer?.is_admin);
      }
    }
    if (!isOwner && !isManager && !isAdmin) {
      return { ok: false, error: "수정 권한이 없습니다." };
    }

    dancerId = explicitDancerId;
    const { error } = await supabase
      .from("dancers")
      .update(baseValues)
      .eq("id", dancerId);
    if (error) return { ok: false, error: humanizeDancerError(error.message) };
  } else {
    // 하위 호환 경로: profile_id로 기존 댄서 찾아 업데이트, 없으면 생성
    const existing = await supabase
      .from("dancers")
      .select("id, profile_id")
      .eq("profile_id", user.id)
      .maybeSingle();

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
  }

  await savePrivateInfoFromForm(supabase, dancerId, formData);

  revalidatePath("/me/portfolio");
  revalidatePath(`/me/portfolio/${dancerId}`);
  revalidatePath("/admin/dancers");
  if (resolvedSlug) revalidatePath(`/d/${resolvedSlug}`);
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

  const roleRaw = (formData.get("role") ?? "self").toString();
  const role: "self" | "manager" = roleRaw === "manager" ? "manager" : "self";

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

  const profileImgUrlRaw = strOrNull(formData, "profile_img_url");
  // 업로드 후 받은 URL이 우리 Supabase storage 버킷과 다르면 에러.
  // (이전엔 silently null이어서 사진이 사라지는 버그 발생)
  if (profileImgUrlRaw && !isValidProfilePhotoUrl(profileImgUrlRaw)) {
    return {
      ok: false,
      error: "프로필 사진 업로드에 문제가 있습니다. 다시 시도해 주세요.",
    };
  }
  const profileImgUrl = profileImgUrlRaw ?? null;

  const supabase = await createClient();

  const social_links = buildSocialLinksFromHandles({
    instagram: parsed.data.social_instagram_handle ?? null,
    youtube: parsed.data.social_youtube_handle ?? null,
    tiktok: parsed.data.social_tiktok_handle ?? null,
  });

  // 자동 슬러그 (stage_name 기반, 충돌 시 -2,-3 ...)
  const autoSlug = await resolveSlug(supabase, null, parsed.data.stage_name, null);

  const insertValues = {
    // self: 본인 계정과 연결. manager: profile_id 없음(댄서 본인 계정 미보유)
    profile_id: role === "self" ? user.id : null,
    stage_name: parsed.data.stage_name,
    korean_name: parsed.data.korean_name ?? null,
    slug: autoSlug,
    gender: parsed.data.gender ?? null,
    bio: parsed.data.bio ?? null,
    location: parsed.data.location ?? null,
    specialties: parsed.data.specialties.length ? parsed.data.specialties : null,
    genres: parsed.data.genres.length ? parsed.data.genres : null,
    social_links,
    ...(profileImgUrl ? { profile_img: profileImgUrl } : {}),
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

  await savePrivateInfoFromForm(supabase, dancerId, formData);

  // 매니저 플로우: 본인을 dancer_managers에 자가 삽입
  if (role === "manager") {
    const { error: mgrError } = await supabase
      .from("dancer_managers")
      .insert({ dancer_id: dancerId, manager_id: user.id });
    if (mgrError) {
      // 댄서 row 정리 (best-effort)
      await supabase.from("dancers").delete().eq("id", dancerId);
      return { ok: false, error: "매니저 등록에 실패했습니다: " + mgrError.message };
    }
  }

  revalidatePath("/me/portfolio");
  revalidatePath("/me");
  return { ok: true, data: { id: dancerId } };
}

// ===========================================================================
// Lite: dancer 포트폴리오 첨부파일 1개 (PDF/JPG/PNG/MP4, 50MB)
// ===========================================================================

/** 본인 dancer만 portfolio_file_* 필드 갱신 가능 (admin 제외). */
async function assertDancerOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dancerId: string,
  userId: string,
): Promise<ActionResult<{ slug: string | null }>> {
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, profile_id, slug")
    .eq("id", dancerId)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "댄서 프로필을 찾을 수 없습니다." };
  if (dancer.profile_id !== userId) {
    // admin 분기: profiles.is_admin
    const { data: viewer } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!viewer?.is_admin) {
      return { ok: false, error: "이 프로필을 편집할 권한이 없습니다." };
    }
  }
  return { ok: true, data: { slug: (dancer.slug as string | null) ?? null } };
}

export async function setDancerPortfolioFileAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancer_id = (formData.get("dancer_id") ?? "").toString();
  const url = (formData.get("url") ?? "").toString();
  const name = (formData.get("name") ?? "").toString().slice(0, 200);
  const size = Number(formData.get("size") ?? 0);
  const mime = (formData.get("mime") ?? "").toString();

  if (!dancer_id) return { ok: false, error: "잘못된 요청입니다." };
  if (!isValidPortfolioFileUrl(url)) {
    return { ok: false, error: "허용되지 않은 파일 URL입니다." };
  }
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MAX_PORTFOLIO_FILE_BYTES
  ) {
    return { ok: false, error: "파일 크기가 허용 범위를 벗어났습니다." };
  }
  if (!(ALLOWED_PORTFOLIO_FILE_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: "허용되지 않은 파일 형식입니다." };
  }

  const supabase = await createClient();
  const guard = await assertDancerOwnership(supabase, dancer_id, user.id);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("dancers")
    .update({
      portfolio_file_url: url,
      portfolio_file_name: name,
      portfolio_file_size_bytes: size,
      portfolio_file_mime: mime,
      portfolio_file_uploaded_at: new Date().toISOString(),
    })
    .eq("id", dancer_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/me/portfolio/${dancer_id}`);
  if (guard.data?.slug) revalidatePath(`/d/${guard.data.slug}`);
  return { ok: true };
}

export async function removeDancerPortfolioFileAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancer_id = (formData.get("dancer_id") ?? "").toString();
  if (!dancer_id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const guard = await assertDancerOwnership(supabase, dancer_id, user.id);
  if (!guard.ok) return guard;

  // 현재 URL에서 storage path 추출하여 best-effort 삭제 (실패해도 진행).
  const { data: row } = await supabase
    .from("dancers")
    .select("portfolio_file_url")
    .eq("id", dancer_id)
    .maybeSingle();
  const currentUrl = (row?.portfolio_file_url as string | null) ?? null;
  if (currentUrl) {
    const prefix = `/storage/v1/object/public/${DANCER_PORTFOLIO_BUCKET}/`;
    const idx = currentUrl.indexOf(prefix);
    if (idx >= 0) {
      const storagePath = decodeURIComponent(
        currentUrl.slice(idx + prefix.length),
      );
      await supabase.storage
        .from(DANCER_PORTFOLIO_BUCKET)
        .remove([storagePath]);
    }
  }

  const { error } = await supabase
    .from("dancers")
    .update({
      portfolio_file_url: null,
      portfolio_file_name: null,
      portfolio_file_size_bytes: null,
      portfolio_file_mime: null,
      portfolio_file_uploaded_at: null,
    })
    .eq("id", dancer_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/me/portfolio/${dancer_id}`);
  if (guard.data?.slug) revalidatePath(`/d/${guard.data.slug}`);
  return { ok: true };
}

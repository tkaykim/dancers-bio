"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { parseVideoUrl } from "@/lib/utils/video";
import { careerSchema } from "@/lib/validation/portfolio";
import type { ActionResult } from "./auth";

type CareerDetails = {
  link?: string;
  role?: string;
  year?: string;
  month?: string;
  description?: string;
  thumbnail?: string;
  youtube_url?: string;
};

function buildCareerDetails(parsed: {
  link?: string | null;
  role?: string | null;
  description?: string | null;
  date: string;
}): CareerDetails {
  const details: CareerDetails = {};
  const [year, month] = parsed.date.split("-");
  if (year) details.year = year;
  if (month) details.month = month;
  if (parsed.role) details.role = parsed.role;
  if (parsed.description) details.description = parsed.description;
  if (parsed.link) {
    const video = parseVideoUrl(parsed.link);
    if (video) {
      details.link = video.url;
      details.youtube_url = video.url;
      if (video.thumbnail_url) details.thumbnail = video.thumbnail_url;
    } else {
      details.link = parsed.link;
    }
  }
  return details;
}

function intFromForm(formData: FormData, key: string, fallback = 0): number {
  const raw = formData.get(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFormToCareerInput(formData: FormData) {
  return careerSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    date: formData.get("date"),
    role: (formData.get("role") ?? "").toString().trim() || null,
    description: (formData.get("description") ?? "").toString().trim() || null,
    link: (formData.get("link") ?? "").toString().trim() || null,
    is_public: true,
    is_representative:
      formData.get("is_representative") === "on" ||
      formData.get("is_representative") === "true",
    sort_order: intFromForm(formData, "sort_order", 0),
  });
}

/**
 * 경력 작업의 대상 댄서를 결정.
 * 1) form에 dancer_id가 있으면 그것을 사용 — 권한(owner/manager/admin) 확인 후 사용
 * 2) 없으면 (구버전 호환) 본인 첫 댄서로 fallback
 *
 * 반환: { ok: true, dancer } | { ok: false, error }
 */
async function resolveTargetDancer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<
  | { ok: true; dancer: { id: string; slug: string | null; profile_id: string | null } }
  | { ok: false; error: string }
> {
  const explicit = (formData.get("dancer_id") ?? "").toString().trim();

  if (explicit) {
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, slug, profile_id")
      .eq("id", explicit)
      .maybeSingle();
    if (!dancer) return { ok: false, error: "댄서 프로필을 찾을 수 없습니다." };

    const isOwner = dancer.profile_id === userId;
    let isManager = false;
    let isAdmin = false;
    if (!isOwner) {
      const { data: mgr } = await supabase
        .from("dancer_managers")
        .select("dancer_id")
        .eq("dancer_id", dancer.id)
        .eq("manager_id", userId)
        .maybeSingle();
      isManager = Boolean(mgr);
      if (!isManager) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        isAdmin = Boolean(profile?.is_admin);
      }
    }
    if (!isOwner && !isManager && !isAdmin) {
      return { ok: false, error: "이 댄서 프로필의 경력을 수정할 권한이 없습니다." };
    }
    return { ok: true, dancer };
  }

  // Fallback (구버전 호환): 본인의 첫 댄서
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, slug, profile_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "먼저 댄서 프로필을 만들어 주세요." };
  return { ok: true, dancer };
}

function revalidateForDancer(dancer: { id: string; slug: string | null }) {
  // 경력 페이지/포트폴리오 페이지 재검증
  revalidatePath(`/me/portfolio/${dancer.id}/careers`);
  revalidatePath(`/me/portfolio/${dancer.id}`);
  revalidatePath("/me/portfolio");
  if (dancer.slug) revalidatePath(`/d/${dancer.slug}`);
  revalidatePath(`/d/${dancer.id}`);
}

export async function addCareerAction(
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const parsed = parseFormToCareerInput(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  }

  const details = buildCareerDetails(parsed.data);

  const { data, error } = await supabase
    .from("careers")
    .insert({
      dancer_id: target.dancer.id,
      type: parsed.data.type,
      title: parsed.data.title,
      date: parsed.data.date,
      details,
      is_public: true,
      is_representative: parsed.data.is_representative,
      sort_order: parsed.data.sort_order,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateForDancer(target.dancer);
  return { ok: true, data: { id: data.id as number } };
}

export async function updateCareerAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return { ok: false, error: "잘못된 요청입니다." };

  const parsed = parseFormToCareerInput(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  }
  const details = buildCareerDetails(parsed.data);

  const { error } = await supabase
    .from("careers")
    .update({
      type: parsed.data.type,
      title: parsed.data.title,
      date: parsed.data.date,
      details,
      is_representative: parsed.data.is_representative,
      sort_order: parsed.data.sort_order,
    })
    .eq("id", id)
    .eq("dancer_id", target.dancer.id);

  if (error) return { ok: false, error: error.message };

  revalidateForDancer(target.dancer);
  return { ok: true };
}

export async function setCareerVisibilityAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return { ok: false, error: "잘못된 요청입니다." };

  const isPublic =
    formData.get("is_public") === "true" || formData.get("is_public") === "on";

  const { error } = await supabase
    .from("careers")
    .update({ is_public: isPublic })
    .eq("id", id)
    .eq("dancer_id", target.dancer.id);

  if (error) return { ok: false, error: error.message };

  revalidateForDancer(target.dancer);
  return { ok: true };
}

export async function deleteCareerAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const target = await resolveTargetDancer(supabase, user.id, formData);
  if (!target.ok) return target;

  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return { ok: false, error: "잘못된 요청입니다." };

  const { error } = await supabase
    .from("careers")
    .delete()
    .eq("id", id)
    .eq("dancer_id", target.dancer.id);

  if (error) return { ok: false, error: error.message };

  revalidateForDancer(target.dancer);
  return { ok: true };
}

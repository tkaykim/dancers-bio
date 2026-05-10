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

function buildCareerDetails(
  parsed: {
    link?: string | null;
    role?: string | null;
    description?: string | null;
    date: string;
  },
): CareerDetails {
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

async function ensureOwnDancer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

function parseFormToCareerInput(formData: FormData) {
  return careerSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    date: formData.get("date"),
    role: (formData.get("role") ?? "").toString().trim() || null,
    description: (formData.get("description") ?? "").toString().trim() || null,
    link: (formData.get("link") ?? "").toString().trim() || null,
    is_public: formData.get("is_public") === "on" || formData.get("is_public") === "true",
    is_representative:
      formData.get("is_representative") === "on" || formData.get("is_representative") === "true",
  });
}

export async function addCareerAction(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const supabase = await createClient();
  const dancerId = await ensureOwnDancer(supabase, user.id);
  if (!dancerId) return { ok: false, error: "먼저 댄서 프로필을 만들어 주세요." };

  const parsed = parseFormToCareerInput(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  }

  const details = buildCareerDetails(parsed.data);

  const { data, error } = await supabase
    .from("careers")
    .insert({
      dancer_id: dancerId,
      type: parsed.data.type,
      title: parsed.data.title,
      date: parsed.data.date,
      details,
      is_public: parsed.data.is_public,
      is_representative: parsed.data.is_representative,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/portfolio/careers");
  revalidatePath("/me/portfolio");
  return { ok: true, data: { id: data.id as number } };
}

export async function updateCareerAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const dancerId = await ensureOwnDancer(supabase, user.id);
  if (!dancerId) return { ok: false, error: "댄서 프로필이 없습니다." };

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
      is_public: parsed.data.is_public,
      is_representative: parsed.data.is_representative,
    })
    .eq("id", id)
    .eq("dancer_id", dancerId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/portfolio/careers");
  revalidatePath("/me/portfolio");
  return { ok: true };
}

export async function deleteCareerAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const dancerId = await ensureOwnDancer(supabase, user.id);
  if (!dancerId) return { ok: false, error: "댄서 프로필이 없습니다." };

  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return { ok: false, error: "잘못된 요청입니다." };

  const { error } = await supabase
    .from("careers")
    .delete()
    .eq("id", id)
    .eq("dancer_id", dancerId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/portfolio/careers");
  revalidatePath("/me/portfolio");
  return { ok: true };
}

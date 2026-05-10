"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { projectSchema, sessionSchema } from "@/lib/validation/projects";
import type { ActionResult } from "./auth";

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

function localDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    visibility: (formData.get("visibility") ?? "public").toString(),
    genre_id: strOrNull(formData, "genre_id"),
    region_id: strOrNull(formData, "region_id"),
    region_text: strOrNull(formData, "region_text"),
    pay_amount: strOrNull(formData, "pay_amount"),
    pay_type: strOrNull(formData, "pay_type"),
    application_deadline: localDateTimeToIso(strOrNull(formData, "application_deadline")),
    publish_now:
      formData.get("publish_now") === "on" ||
      formData.get("publish_now") === "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  // Parse sessions (form encodes count + indexed entries)
  const count = Number(formData.get("sessions_count") ?? 0);
  const sessions: Array<{
    session_type: string;
    starts_at: string;
    ends_at: string | null;
    location_name: string | null;
    role_notes: string | null;
    sort_order: number;
  }> = [];
  for (let i = 0; i < count; i++) {
    const startsRaw = strOrNull(formData, `sessions[${i}][starts_at]`);
    const startsIso = localDateTimeToIso(startsRaw);
    if (!startsIso) continue;
    const endsIso = localDateTimeToIso(strOrNull(formData, `sessions[${i}][ends_at]`));
    const sParsed = sessionSchema.safeParse({
      session_type: (formData.get(`sessions[${i}][type]`) ?? "main").toString(),
      starts_at: startsIso,
      ends_at: endsIso,
      location_name: strOrNull(formData, `sessions[${i}][location_name]`),
      role_notes: strOrNull(formData, `sessions[${i}][role_notes]`),
      sort_order: i,
    });
    if (sParsed.success) {
      sessions.push({
        session_type: sParsed.data.session_type,
        starts_at: sParsed.data.starts_at,
        ends_at: sParsed.data.ends_at ?? null,
        location_name: sParsed.data.location_name ?? null,
        role_notes: sParsed.data.role_notes ?? null,
        sort_order: sParsed.data.sort_order,
      });
    }
  }

  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      status: parsed.data.publish_now ? "open" : "draft",
      genre_id: parsed.data.genre_id ?? null,
      region_id: parsed.data.region_id ?? null,
      region_text: parsed.data.region_text ?? null,
      pay_amount: parsed.data.pay_amount ?? null,
      pay_type: parsed.data.pay_type ?? null,
      application_deadline: parsed.data.application_deadline ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        error: "프로젝트 개설 권한이 없습니다. 관리자에게 문의해 주세요.",
      };
    }
    return { ok: false, error: error.message };
  }

  if (sessions.length > 0) {
    const { error: sErr } = await supabase
      .from("project_sessions")
      .insert(sessions.map((s) => ({ ...s, project_id: project.id })));
    if (sErr) return { ok: false, error: `세션 저장 실패: ${sErr.message}` };
  }

  revalidatePath("/feed");
  revalidatePath("/me");
  return { ok: true, data: { id: project.id as string } };
}

export async function closeProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "closed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/feed");
  return { ok: true };
}

export async function deleteProjectAction(
  formData: FormData,
): Promise<void> {
  await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await createClient();
  await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/feed");
  revalidatePath("/me");
  redirect("/me");
}

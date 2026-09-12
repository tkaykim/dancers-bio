"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { intakeDb, type IntakeJob } from "@/lib/project-intake/db";
import {
  intakeInputSchema,
  projectDraftSchema,
  validateResult,
} from "@/lib/project-intake/schema";

const route = "/admin/projects/intake";
const BUCKET = "project-intake";
const failed = () => ({
  ok: false as const,
  error: "처리를 완료하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.",
});

export async function prepareIntakeUpload(input: unknown) {
  const actor = await requireAdmin();
  const parsed = z
    .object({
      request_id: z.string().uuid(),
      mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      size: z
        .number()
        .int()
        .min(1)
        .max(8 * 1024 * 1024),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "PNG·JPEG·WebP, 파일당 8MB 이내로 올려 주세요.",
    };
  const { request_id, mime } = parsed.data;
  const path = `${actor.id}/${request_id}/sources/${randomUUID()}.${mime.split("/")[1]}`;
  const { data, error } = await intakeDb()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  return error || !data
    ? failed()
    : { ok: true as const, data: { path, token: data.token } };
}

export async function submitProjectIntake(input: unknown) {
  const actor = await requireAdmin();
  const parsed = intakeInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const prefix = `${actor.id}/${v.request_id}/sources/`;
  if (
    v.source_paths.some(
      (p) =>
        !p.startsWith(prefix) ||
        !/^[-a-zA-Z0-9/_.]+$/.test(p) ||
        p.includes(".."),
    )
  )
    return failed();
  const db = intakeDb();
  const { error } = await db
    .from("project_intake_jobs")
    .insert({
      id: v.request_id,
      created_by: actor.id,
      source_raw: v.source_raw,
      source_paths: v.source_paths,
      languages: v.languages,
      private_terms: v.private_terms,
      hide_names: v.hide_names,
      operator_notes: v.operator_notes,
    });
  if (error && error.code !== "23505") return failed();
  if (error) {
    const { data } = await db
      .from("project_intake_jobs")
      .select("id")
      .eq("id", v.request_id)
      .eq("created_by", actor.id)
      .maybeSingle();
    if (!data) return failed();
  }
  revalidatePath(route);
  return { ok: true as const, id: v.request_id };
}

export async function listProjectIntakes() {
  await requireAdmin();
  const db = intakeDb();
  const { data, error } = await db
    .from("project_intake_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error)
    return { ok: false as const, error: "공고 준비함을 불러오지 못했습니다." };
  const jobs = (data || []) as IntakeJob[];
  const paths = jobs.flatMap((j) => [
    ...j.source_paths,
    ...j.assets.map((a) => a.path),
  ]);
  const signed = paths.length
    ? await db.storage.from(BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };
  const urls = new Map((signed.data || []).map((s) => [s.path, s.signedUrl]));
  const ids = jobs.flatMap((j) => (j.project_id ? [j.project_id] : []));
  const projects = ids.length
    ? await db.from("projects").select("id,short_code").in("id", ids)
    : { data: [] };
  const codes = new Map((projects.data || []).map((p) => [p.id, p.short_code]));
  for (const job of jobs) {
    for (const asset of job.assets)
      asset.url = urls.get(asset.path) || undefined;
    job.source_urls = job.source_paths.map((path) => ({
      path,
      url: urls.get(path) || undefined,
    }));
    if (job.project_id) job.project_code = codes.get(job.project_id);
  }
  return { ok: true as const, jobs };
}

export async function reviseProjectIntake(input: unknown) {
  await requireAdmin();
  const parsed = z
    .object({
      id: z.string().uuid(),
      revision: z.number().int().positive(),
      notes: z.string().max(3000),
      project: projectDraftSchema.nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return failed();
  const v = parsed.data;
  const db = intakeDb();
  const { data: previous } = await db
    .from("project_intake_jobs")
    .select("operator_notes")
    .eq("id", v.id)
    .eq("revision", v.revision)
    .single();
  if (!previous) return failed();
  const notes = [previous.operator_notes, v.notes]
    .filter(Boolean)
    .join("\n\n추가 수정 지침:\n");
  if (notes.length > 12000)
    return {
      ok: false as const,
      error:
        "수정 지침이 너무 길어졌습니다. 최신 조건을 정리해 새 초안으로 접수해 주세요.",
    };
  const { data, error } = await intakeDb()
    .from("project_intake_jobs")
    .update({
      status: "queued",
      revision: v.revision + 1,
      operator_notes: notes,
      project_override: v.project,
      result: null,
      assets: [],
      studio_jobs: {},
      attempts: 0,
      error: null,
      lease_token: null,
      lease_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.id)
    .eq("revision", v.revision)
    .in("status", ["review", "failed"])
    .is("project_id", null)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      ok: false as const,
      error: "다른 변경이 있거나 처리 중입니다. 새로고침해 주세요.",
    };
  revalidatePath(route);
  return { ok: true as const };
}

export async function registerProjectIntake(input: unknown) {
  const actor = await requireAdmin();
  const parsed = z
    .object({ id: z.string().uuid(), revision: z.number().int().positive() })
    .safeParse(input);
  if (!parsed.success) return failed();
  const db = intakeDb();
  const { data: job } = await db
    .from("project_intake_jobs")
    .select("*")
    .eq("id", parsed.data.id)
    .single();
  if (!job) return failed();
  try {
    validateResult(job.result, job.languages, job.private_terms);
  } catch {
    return {
      ok: false as const,
      error: "문안 검증이 필요합니다. 수정 후 다시 생성해 주세요.",
    };
  }
  const { data: id, error } = await db.rpc("register_project_intake", {
    p_id: job.id,
    p_revision: parsed.data.revision,
    p_actor: actor.id,
  });
  if (error)
    return {
      ok: false as const,
      error: "등록 상태가 바뀌었습니다. 새로고침 후 확인해 주세요.",
    };
  const { data: p } = await db
    .from("projects")
    .select("short_code")
    .eq("id", id)
    .single();
  revalidatePath(route);
  revalidatePath("/admin/projects");
  return { ok: true as const, code: p?.short_code as string };
}

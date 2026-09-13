import "server-only";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { intakeDb } from "./db";
import type { ProjectAttachmentDraft } from "@/lib/storage/project-file";

const scheduleSchema = z
  .array(
    z
      .object({
        label: z.string().trim().min(1).max(120),
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }).nullable(),
        location: z.string().max(120).nullable(),
        time_tbd: z.boolean(),
      })
      .refine(
        (s) => !s.ends_at || Date.parse(s.ends_at) >= Date.parse(s.starts_at),
        "일정 종료 시간을 확인해 주세요.",
      ),
  )
  .max(30);

export async function registerIntakeForm(
  form: FormData,
  project: Record<string, unknown>,
  attachments: ProjectAttachmentDraft[],
) {
  const actor = await requireAdmin();
  const request = z
    .object({
      id: z.string().uuid(),
      revision: z.coerce.number().int().positive(),
    })
    .safeParse({
      id: form.get("intake_id"),
      revision: form.get("intake_revision"),
    });
  if (!request.success)
    return { ok: false as const, error: "공고 준비 정보를 확인해 주세요." };
  const count = Number(form.get("schedules_count") || 0);
  if (!Number.isInteger(count) || count < 0 || count > 30)
    return {
      ok: false as const,
      error: "일정은 최대 30개까지 등록할 수 있습니다.",
    };
  const rows = Array.from({ length: count }, (_, i) => {
    const text = (key: string) =>
      String(form.get(`schedules[${i}][${key}]`) || "").trim();
    return {
      label: text("label"),
      starts_at: text("starts_at"),
      ends_at: text("ends_at") || null,
      location: text("location") || null,
      time_tbd: text("time_tbd") === "true",
    };
  });
  const schedules = scheduleSchema.safeParse(rows);
  if (!schedules.success)
    return {
      ok: false as const,
      error: "일정의 날짜·시간·장소를 확인해 주세요.",
    };
  const db = intakeDb();
  const { data: job } = await db
    .from("project_intake_jobs")
    .select("private_terms,result")
    .eq("id", request.data.id)
    .maybeSingle();
  if (!job)
    return { ok: false as const, error: "공고 준비 정보를 찾지 못했습니다." };
  const publicText = JSON.stringify(project).normalize("NFKC").toLowerCase();
  const terms = [
    ...(job.private_terms ?? []),
    ...(job.result?.private_terms ?? []),
  ] as string[];
  if (
    terms.some((term) =>
      publicText.includes(term.normalize("NFKC").toLowerCase()),
    )
  )
    return {
      ok: false as const,
      error: "공개 문안에 비공개 명칭이 포함되어 있습니다. 수정해 주세요.",
    };
  const { data, error } = await db.rpc("register_project_intake_form", {
    p_id: request.data.id,
    p_revision: request.data.revision,
    p_actor: actor.id,
    p_project: project,
    p_schedules: schedules.data,
    p_attachments: attachments,
  });
  if (error || !data?.[0])
    return {
      ok: false as const,
      error: "공고 준비 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.",
    };
  const { data: saved } = await db
    .from("projects")
    .select("id,short_code")
    .eq("id", data[0].project_id)
    .single();
  if (!saved)
    return {
      ok: false as const,
      error: "등록된 공고를 불러오지 못했습니다. 준비함에서 확인해 주세요.",
    };
  return {
    ok: true as const,
    data: saved as { id: string; short_code: string },
    created: data[0].created as boolean,
  };
}

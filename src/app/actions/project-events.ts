"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectApplicationScopeIds } from "@/lib/ops/project-application-scope";
import type { ActionResult } from "./auth";

function text(fd: FormData, key: string, max = 200): string | null {
  const value = (fd.get(key) ?? "").toString().trim();
  return value ? value.slice(0, max) : null;
}

function iso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const ATTENDANCE_STATUSES = new Set([
  "not_arrived",
  "checked_in",
  "no_show",
  "self_withdrawn",
]);

const ONSITE_STATUSES = new Set([
  "waiting",
  "watching",
  "hold",
  "eliminated",
  "finalist",
  "self_withdrawn",
]);

const OUTREACH_STATUSES = new Set([
  "pending",
  "no_answer",
  "unavailable",
  "available",
  "do_not_contact",
  "done",
]);

type AdminClient = ReturnType<typeof createAdminClient>;

function buildBibCode(index: number) {
  const groupIndex = Math.floor(index / 30);
  const group = String.fromCharCode(65 + groupIndex);
  const number = String((index % 30) + 1).padStart(2, "0");
  return `${group}-${number}`;
}

async function syncEventOperations(
  admin: AdminClient,
  {
    eventId,
    projectId,
    userId,
  }: { eventId: string; projectId: string; userId: string },
) {
  const { data: participants } = await admin
    .from("event_participants")
    .select("id, dancer_id, application_id, recruitment_channel_id, bib_code, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const rows = (participants ?? []) as Array<{
    id: string;
    dancer_id: string;
    application_id: string | null;
    recruitment_channel_id: string | null;
    bib_code: string | null;
  }>;

  const usedBibCodes = new Set(
    rows.map((row) => row.bib_code).filter((value): value is string => !!value),
  );
  let cursor = 0;

  for (const row of rows) {
    if (row.bib_code) continue;

    let nextCode = buildBibCode(cursor);
    while (usedBibCodes.has(nextCode)) {
      cursor += 1;
      nextCode = buildBibCode(cursor);
    }

    usedBibCodes.add(nextCode);
    cursor += 1;
    await admin
      .from("event_participants")
      .update({ bib_code: nextCode })
      .eq("id", row.id);
  }

  const { data: existingTasks } = await admin
    .from("outreach_tasks")
    .select("dancer_id")
    .eq("event_id", eventId);
  const existingDancerIds = new Set(
    ((existingTasks ?? []) as Array<{ dancer_id: string | null }>)
      .map((task) => task.dancer_id)
      .filter((value): value is string => !!value),
  );

  const taskRows = rows
    .filter((row) => row.dancer_id && !existingDancerIds.has(row.dancer_id))
    .map((row) => ({
      project_id: projectId,
      recruitment_channel_id: row.recruitment_channel_id,
      event_id: eventId,
      application_id: row.application_id,
      dancer_id: row.dancer_id,
      contact_method: "phone",
      status: "pending",
      priority: 0,
      created_by: userId,
    }));

  if (taskRows.length > 0) {
    await admin.from("outreach_tasks").insert(taskRows);
  }
}

export async function createProjectEventAction(
  formData: FormData,
): Promise<
  ActionResult<{ id: string; ops_code: string; public_pass_code: string }>
> {
  const user = await requireUser();
  const projectId = text(formData, "project_id", 80);
  const name = text(formData, "name", 120);
  const eventType = text(formData, "event_type", 40) ?? "other";
  if (!projectId || !name) {
    return { ok: false, error: "프로젝트와 운영일정명을 확인해 주세요." };
  }
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "운영일정을 만들 권한이 없습니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_events")
    .insert({
      project_id: projectId,
      name,
      event_type: eventType,
      starts_at: iso(text(formData, "starts_at", 60)),
      ends_at: iso(text(formData, "ends_at", 60)),
      location: text(formData, "location", 200),
      created_by: user.id,
    })
    .select("id, ops_code, public_pass_code")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "운영일정을 만들 권한이 없습니다." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  return {
    ok: true,
    data: data as { id: string; ops_code: string; public_pass_code: string },
  };
}

export async function seedEventParticipantsFromAcceptedAction(
  formData: FormData,
): Promise<ActionResult<{ inserted: number; existing: number; total: number }>> {
  const user = await requireUser();
  const eventId = text(formData, "event_id", 80);
  if (!eventId) return { ok: false, error: "운영일정을 확인해 주세요." };

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("project_events")
    .select("id, project_id, ops_code")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: "운영일정을 찾을 수 없습니다." };

  const projectId = event.project_id as string;
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "참가자를 생성할 권한이 없습니다." };
  }

  const admin = createAdminClient();
  const projectScopeIds = await getProjectApplicationScopeIds(admin, projectId);
  const { data: apps, error: appError } = await admin
    .from("applications")
    .select("id, dancer_id, recruitment_channel_id")
    .in("project_id", projectScopeIds)
    .eq("status", "accepted")
    .is("archived_at", null)
    .not("dancer_id", "is", null)
    .order("created_at", { ascending: true });
  if (appError) return { ok: false, error: appError.message };

  const uniqueByDancer = new Map<
    string,
    { id: string; dancer_id: string; recruitment_channel_id: string | null }
  >();
  for (const app of (apps ?? []) as Array<{
    id: string;
    dancer_id: string | null;
    recruitment_channel_id: string | null;
  }>) {
    if (!app.dancer_id || uniqueByDancer.has(app.dancer_id)) continue;
    uniqueByDancer.set(app.dancer_id, {
      id: app.id,
      dancer_id: app.dancer_id,
      recruitment_channel_id: app.recruitment_channel_id,
    });
  }

  const candidates = Array.from(uniqueByDancer.values());
  if (candidates.length === 0) {
    return { ok: true, data: { inserted: 0, existing: 0, total: 0 } };
  }

  const { count: existingCount } = await supabase
    .from("event_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  const { data: insertedRows, error } = await supabase
    .from("event_participants")
    .upsert(
      candidates.map((app) => ({
        event_id: eventId,
        application_id: app.id,
        dancer_id: app.dancer_id,
        recruitment_channel_id: app.recruitment_channel_id,
        created_by: user.id,
      })),
      { onConflict: "event_id,dancer_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { ok: false, error: error.message };

  await syncEventOperations(admin, { eventId, projectId, userId: user.id });

  const inserted = insertedRows?.length ?? 0;
  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath(`/ops/events/${event.ops_code as string}`);
  return {
    ok: true,
    data: {
      inserted,
      existing: existingCount ?? 0,
      total: candidates.length,
    },
  };
}

export async function updateEventParticipantOpsAction(
  formData: FormData,
): Promise<
  ActionResult<{
    id: string;
    attendance_status: string;
    onsite_status: string;
    checked_in_at: string | null;
    eliminated_at: string | null;
    note: string;
    updated_at: string;
  }>
> {
  const opsCode = text(formData, "ops_code", 80);
  const participantId = text(formData, "participant_id", 80);
  const attendanceStatus = text(formData, "attendance_status", 40) ?? "not_arrived";
  const onsiteStatus = text(formData, "onsite_status", 40) ?? "waiting";
  const note = text(formData, "note", 1000) ?? "";

  if (!opsCode || !participantId) {
    return { ok: false, error: "운영일정과 참가자를 확인해 주세요." };
  }
  if (!ATTENDANCE_STATUSES.has(attendanceStatus)) {
    return { ok: false, error: "출석 상태를 확인해 주세요." };
  }
  if (!ONSITE_STATUSES.has(onsiteStatus)) {
    return { ok: false, error: "현장 상태를 확인해 주세요." };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("project_events")
    .select("id")
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!event) return { ok: false, error: "운영일정을 찾을 수 없습니다." };

  const { data: participant } = await admin
    .from("event_participants")
    .select("id, event_id, checked_in_at, eliminated_at")
    .eq("id", participantId)
    .eq("event_id", event.id as string)
    .maybeSingle();
  if (!participant) return { ok: false, error: "참가자를 찾을 수 없습니다." };

  const now = new Date().toISOString();
  const nextCheckedInAt =
    attendanceStatus === "checked_in"
      ? ((participant.checked_in_at as string | null) ?? now)
      : null;
  const nextEliminatedAt =
    onsiteStatus === "eliminated" || onsiteStatus === "self_withdrawn"
      ? ((participant.eliminated_at as string | null) ?? now)
      : null;

  const { data, error } = await admin
    .from("event_participants")
    .update({
      attendance_status: attendanceStatus,
      onsite_status: onsiteStatus,
      note,
      checked_in_at: nextCheckedInAt,
      eliminated_at: nextEliminatedAt,
    })
    .eq("id", participantId)
    .eq("event_id", event.id as string)
    .select("id, attendance_status, onsite_status, checked_in_at, eliminated_at, note, updated_at")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/ops/events/${opsCode}`);
  return {
    ok: true,
    data: data as {
      id: string;
      attendance_status: string;
      onsite_status: string;
      checked_in_at: string | null;
      eliminated_at: string | null;
      note: string;
      updated_at: string;
    },
  };
}

export async function updateEventOutreachTaskAction(
  formData: FormData,
): Promise<
  ActionResult<{
    id: string;
    status: string;
    contact_method: string;
    last_contacted_at: string | null;
    result_note: string;
    updated_at: string;
  }>
> {
  const opsCode = text(formData, "ops_code", 80);
  const taskId = text(formData, "task_id", 80);
  const status = text(formData, "status", 40) ?? "pending";
  const contactMethod = text(formData, "contact_method", 40) ?? "phone";
  const resultNote = text(formData, "result_note", 1000) ?? "";

  if (!opsCode || !taskId) {
    return { ok: false, error: "운영일정과 연락 대상을 확인해 주세요." };
  }
  if (!OUTREACH_STATUSES.has(status)) {
    return { ok: false, error: "연락 상태를 확인해 주세요." };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("project_events")
    .select("id")
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!event) return { ok: false, error: "운영일정을 찾을 수 없습니다." };

  const nextLastContactedAt =
    status === "pending" ? null : new Date().toISOString();
  const { data, error } = await admin
    .from("outreach_tasks")
    .update({
      status,
      contact_method: contactMethod,
      result_note: resultNote,
      last_contacted_at: nextLastContactedAt,
    })
    .eq("id", taskId)
    .eq("event_id", event.id as string)
    .select("id, status, contact_method, last_contacted_at, result_note, updated_at")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/ops/events/${opsCode}`);
  return {
    ok: true,
    data: data as {
      id: string;
      status: string;
      contact_method: string;
      last_contacted_at: string | null;
      result_note: string;
      updated_at: string;
    },
  };
}

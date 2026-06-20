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
    .select("id, project_id")
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
    .not("dancer_id", "is", null);
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

  const inserted = insertedRows?.length ?? 0;
  revalidatePath(`/projects/${projectId}/applicants`);
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

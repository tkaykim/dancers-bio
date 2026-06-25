"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getUser, requireUser } from "@/lib/auth/guard";
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

// 운영보드 mutation 권한 게이트: 로그인 + (프로젝트 관리권한 OR 해당 행사 스태프).
// ops_code 는 행사 식별용일 뿐, 처리 권한은 로그인 계정으로 판정한다.
async function authorizeEventByOpsCode(
  admin: AdminClient,
  opsCode: string,
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const { data: event } = await admin
    .from("project_events")
    .select("id, project_id")
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!event) return { ok: false, error: "운영일정을 찾을 수 없습니다." };
  const eventId = event.id as string;
  if (await canManageProject(event.project_id as string)) {
    return { ok: true, eventId };
  }
  const { data: staff } = await admin
    .from("event_staff")
    .select("id, expires_at")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .maybeSingle();
  const staffActive =
    !!staff &&
    (!staff.expires_at || new Date(staff.expires_at as string) > new Date());
  if (staffActive) return { ok: true, eventId };
  return { ok: false, error: "권한이 없습니다." };
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

// 수락 지원자를 운영보드 참가자로 시드하는 핵심 로직 (직접 시드·일정 확정 공용).
// 성공 시 카운트를 반환하고, DB 오류는 throw 한다 (호출부에서 처리).
async function seedAcceptedParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: AdminClient,
  {
    eventId,
    projectId,
    userId,
  }: { eventId: string; projectId: string; userId: string },
): Promise<{ inserted: number; existing: number; total: number }> {
  const projectScopeIds = await getProjectApplicationScopeIds(admin, projectId);
  const { data: apps, error: appError } = await admin
    .from("applications")
    .select("id, dancer_id, recruitment_channel_id")
    .in("project_id", projectScopeIds)
    .eq("status", "accepted")
    .is("archived_at", null)
    .not("dancer_id", "is", null)
    .order("created_at", { ascending: true });
  if (appError) throw new Error(appError.message);

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
  if (candidates.length === 0) return { inserted: 0, existing: 0, total: 0 };

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
        created_by: userId,
      })),
      { onConflict: "event_id,dancer_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);

  await syncEventOperations(admin, { eventId, projectId, userId });

  return {
    inserted: insertedRows?.length ?? 0,
    existing: existingCount ?? 0,
    total: candidates.length,
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
  try {
    const result = await seedAcceptedParticipants(supabase, admin, {
      eventId,
      projectId,
      userId: user.id,
    });
    revalidatePath(`/projects/${projectId}/applicants`);
    revalidatePath(`/ops/events/${event.ops_code as string}`);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시드 실패" };
  }
}

// 허용 event_type (DB는 자유 텍스트지만 UI 셀렉트와 일치시킨다)
const EVENT_TYPES = new Set([
  "audition",
  "rehearsal",
  "shoot",
  "fitting",
  "meeting",
  "other",
]);

// 취합 일정(project_schedule)을 확정하고, 그 일정 전용 운영보드(project_event)를 만든다.
// 한 번의 액션으로: status=confirmed + 이벤트 생성(일정 정보 복사) + 양방향 연결 + 수락자 시드.
// 이미 연결된 보드가 있으면 그대로 그 보드를 반환한다 (멱등).
export async function confirmScheduleAndCreateBoardAction(
  formData: FormData,
): Promise<ActionResult<{ event_id: string; ops_code: string; inserted: number }>> {
  const user = await requireUser();
  const scheduleId = text(formData, "schedule_id", 80);
  const projectId = text(formData, "project_id", 80);
  if (!scheduleId || !projectId) {
    return { ok: false, error: "일정을 확인해 주세요." };
  }
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "운영보드를 만들 권한이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select(
      "id, project_id, label, starts_at, ends_at, location, session_type, project_event_id",
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sch || (sch.project_id as string) !== projectId) {
    return { ok: false, error: "일정을 찾을 수 없습니다." };
  }

  // 이미 보드가 연결돼 있으면 그대로 반환 (중복 생성 방지).
  if (sch.project_event_id) {
    const { data: existing } = await admin
      .from("project_events")
      .select("id, ops_code")
      .eq("id", sch.project_event_id as string)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        data: {
          event_id: existing.id as string,
          ops_code: existing.ops_code as string,
          inserted: 0,
        },
      };
    }
  }

  const sessionType = (sch.session_type as string | null) ?? "";
  const eventType = EVENT_TYPES.has(sessionType) ? sessionType : "other";

  const supabase = await createClient();
  const { data: event, error: evErr } = await supabase
    .from("project_events")
    .insert({
      project_id: projectId,
      name: sch.label as string,
      event_type: eventType,
      starts_at: sch.starts_at as string | null,
      ends_at: sch.ends_at as string | null,
      location: sch.location as string | null,
      created_by: user.id,
    })
    .select("id, ops_code")
    .single();
  if (evErr) {
    if (evErr.code === "42501") {
      return { ok: false, error: "운영보드를 만들 권한이 없습니다." };
    }
    return { ok: false, error: evErr.message };
  }

  // 일정 확정 + 양방향 연결.
  await admin
    .from("project_schedules")
    .update({ status: "confirmed", project_event_id: event.id as string })
    .eq("id", scheduleId);

  // 수락 지원자 시드 (실패해도 보드 생성 자체는 유지).
  let inserted = 0;
  try {
    const seeded = await seedAcceptedParticipants(supabase, admin, {
      eventId: event.id as string,
      projectId,
      userId: user.id,
    });
    inserted = seeded.inserted;
  } catch {
    // 시드 실패 무시 — 보드에서 "수락자 반영"으로 재시도 가능.
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath(`/ops/events/${event.ops_code as string}`);
  return {
    ok: true,
    data: {
      event_id: event.id as string,
      ops_code: event.ops_code as string,
      inserted,
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
  const auth = await authorizeEventByOpsCode(admin, opsCode);
  if (!auth.ok) return { ok: false, error: auth.error };
  const event = { id: auth.eventId };

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

export async function updateEventParticipantGenderAction(
  formData: FormData,
): Promise<ActionResult<{ dancer_id: string; gender: string | null }>> {
  const opsCode = text(formData, "ops_code", 80);
  const participantId = text(formData, "participant_id", 80);
  const genderRaw = (formData.get("gender") ?? "").toString().trim();
  const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : null;

  if (!opsCode || !participantId) {
    return { ok: false, error: "운영일정과 참가자를 확인해 주세요." };
  }

  const admin = createAdminClient();
  const auth = await authorizeEventByOpsCode(admin, opsCode);
  if (!auth.ok) return { ok: false, error: auth.error };
  const event = { id: auth.eventId };

  const { data: participant } = await admin
    .from("event_participants")
    .select("dancer_id")
    .eq("id", participantId)
    .eq("event_id", event.id as string)
    .maybeSingle();
  if (!participant?.dancer_id) {
    return { ok: false, error: "참가자를 찾을 수 없습니다." };
  }

  const { error } = await admin
    .from("dancers")
    .update({ gender })
    .eq("id", participant.dancer_id as string);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/ops/events/${opsCode}`);
  return { ok: true, data: { dancer_id: participant.dancer_id as string, gender } };
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
  const auth = await authorizeEventByOpsCode(admin, opsCode);
  if (!auth.ok) return { ok: false, error: auth.error };
  const event = { id: auth.eventId };

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

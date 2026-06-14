"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getUser, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import { makeScheduleToken, verifyScheduleToken } from "@/lib/quick-token";
import { buildScheduleRequestEmail } from "@/lib/notify/schedule-mail";
import { formatWhen } from "@/lib/format-when";
import { sendGmailEmail } from "@/lib/gmail";
import type { ActionResult } from "./auth";

const SITE = "https://deetz.kr";

function strOrNull(fd: FormData, k: string): string | null {
  const v = (fd.get(k) ?? "").toString().trim();
  return v ? v : null;
}
function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// 후보 일정 추가 (프로젝트 생성 시 또는 이후 언제든)
export async function createScheduleAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const label = strOrNull(fd, "label");
  if (!projectId || !label)
    return { ok: false, error: "일정 제목을 입력해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_schedules")
    .insert({
      project_id: projectId,
      label,
      starts_at: isoOrNull(strOrNull(fd, "starts_at")),
      ends_at: isoOrNull(strOrNull(fd, "ends_at")),
      location: strOrNull(fd, "location"),
      note: strOrNull(fd, "note"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteScheduleAction(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("schedule_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (projectId && !(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_schedules")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (projectId) revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

// 특정 일정의 응답자 명단 (관리자용)
export async function getScheduleRespondersAction(
  scheduleId: string,
): Promise<
  ActionResult<
    Array<{ dancer_id: string; name: string; status: string; note: string | null }>
  >
> {
  await requireUser();
  const supabase = await createClient();
  // RLS(psr_select)가 관리권한 보장
  const { data, error } = await supabase
    .from("project_schedule_responses")
    .select(
      "dancer_id, status, note, dancer:dancers!project_schedule_responses_dancer_id_fkey ( stage_name )",
    )
    .eq("schedule_id", scheduleId)
    .order("status");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as Array<{
    dancer_id: string;
    status: string;
    note: string | null;
    dancer: { stage_name: string | null } | { stage_name: string | null }[] | null;
  }>;
  return {
    ok: true,
    data: rows.map((r) => {
      const dn = Array.isArray(r.dancer) ? r.dancer[0] ?? null : r.dancer;
      return {
        dancer_id: r.dancer_id,
        name: dn?.stage_name ?? "(이름 없음)",
        status: r.status,
        note: r.note,
      };
    }),
  };
}

// 지원자 응답 제출 (토큰 매직링크, 로그인 없음)
export async function submitScheduleResponseAction(
  fd: FormData,
): Promise<ActionResult> {
  const token = (fd.get("token") ?? "").toString();
  const v = verifyScheduleToken(token);
  if (!v) return { ok: false, error: "링크가 유효하지 않습니다." };
  const status = (fd.get("status") ?? "").toString();
  if (!["available", "partial", "unavailable"].includes(status))
    return { ok: false, error: "응답을 선택해 주세요." };

  let time_slots: unknown = null;
  const raw = (fd.get("time_slots") ?? "").toString();
  if (raw) {
    try {
      time_slots = JSON.parse(raw);
    } catch {
      time_slots = null;
    }
  }
  const note = strOrNull(fd, "note");

  const admin = createAdminClient();
  const { error } = await admin
    .from("project_schedule_responses")
    .upsert(
      {
        schedule_id: v.scheduleId,
        dancer_id: v.dancerId,
        status,
        time_slots: status === "partial" ? time_slots : null,
        note,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "schedule_id,dancer_id" },
    );
  if (error) return { ok: false, error: "저장에 실패했습니다." };
  return { ok: true };
}

// 단톡방 공유 링크용: 로그인된 본인 계정으로 여러 일정 가능여부를 한 번에 제출.
// code = projects.schedule_survey_code (프로젝트 단위 설문 코드)
type ScheduleAnswer = {
  schedule_id: string;
  status: "available" | "partial" | "unavailable";
  time_slots?: unknown;
  note?: string | null;
};

export async function submitProjectScheduleResponsesAction(
  fd: FormData,
): Promise<ActionResult<{ saved: number }>> {
  const code = (fd.get("code") ?? "").toString().trim();
  if (!code) return { ok: false, error: "링크가 유효하지 않습니다." };
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  let answers: ScheduleAnswer[] = [];
  try {
    const parsed = JSON.parse((fd.get("answers") ?? "[]").toString());
    if (Array.isArray(parsed)) answers = parsed as ScheduleAnswer[];
  } catch {
    answers = [];
  }
  const valid = answers.filter(
    (a) =>
      a &&
      typeof a.schedule_id === "string" &&
      ["available", "partial", "unavailable"].includes(a.status),
  );
  if (valid.length === 0)
    return { ok: false, error: "각 일정의 가능 여부를 선택해 주세요." };

  const admin = createAdminClient();
  // 코드 → 프로젝트
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("schedule_survey_code", code)
    .maybeSingle();
  if (!project) return { ok: false, error: "설문을 찾을 수 없습니다." };
  const projectId = project.id as string;

  // 로그인 세션 → 이 프로젝트의 지원자(dancer) 매칭
  const dancerId = await resolveDancerIdForUserInProject(projectId, user.id);
  if (!dancerId)
    return {
      ok: false,
      error:
        "이 프로젝트에 지원한 기록이 없어요. 지원하신 계정으로 로그인했는지 확인해 주세요.",
    };

  // 이 프로젝트에 실제 존재하는 일정만 허용 (타프로젝트 일정 위조 방지)
  const { data: schRows } = await admin
    .from("project_schedules")
    .select("id")
    .eq("project_id", projectId);
  const allowed = new Set((schRows ?? []).map((s: { id: string }) => s.id));

  const now = new Date().toISOString();
  const rows = valid
    .filter((a) => allowed.has(a.schedule_id))
    .map((a) => ({
      schedule_id: a.schedule_id,
      dancer_id: dancerId,
      status: a.status,
      time_slots: a.status === "partial" ? (a.time_slots ?? null) : null,
      note: (a.note ?? "").toString().trim() || null,
      responded_at: now,
    }));
  if (rows.length === 0)
    return { ok: false, error: "유효한 일정이 없습니다." };

  const { error } = await admin
    .from("project_schedule_responses")
    .upsert(rows, { onConflict: "schedule_id,dancer_id" });
  if (error) return { ok: false, error: "저장에 실패했습니다." };
  return { ok: true, data: { saved: rows.length } };
}

// 가능여부 요청 메일 발송. audience: 'pending_accepted'(기본, 탈락 제외) | 'test'
export async function sendScheduleRequestsAction(
  fd: FormData,
): Promise<ActionResult<{ sent: number; skipped: number }>> {
  await requireUser();
  const scheduleId = (fd.get("schedule_id") ?? "").toString().trim();
  if (!scheduleId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select("id, project_id, label, starts_at, ends_at, location")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sch) return { ok: false, error: "일정을 찾을 수 없습니다." };
  if (!(await canManageProject(sch.project_id as string)))
    return { ok: false, error: "권한이 없습니다." };

  // 대상: 탈락 제외(대기+수락) 지원자, 댄서별 중복 제거
  const { data: apps } = await admin
    .from("applications")
    .select("dancer_id, applicant_id, status")
    .eq("project_id", sch.project_id)
    .is("archived_at", null)
    .in("status", ["pending", "accepted"])
    .not("dancer_id", "is", null);

  const seen = new Set<string>();
  const targets = (apps ?? []).filter((a: { dancer_id: string }) => {
    if (seen.has(a.dancer_id)) return false;
    seen.add(a.dancer_id);
    return true;
  });

  const whenText = formatWhen(
    sch.starts_at as string | null,
    sch.ends_at as string | null,
  );
  let sent = 0;
  let skipped = 0;
  for (const a of targets as Array<{ dancer_id: string; applicant_id: string | null }>) {
    // 이름 + 이메일 확보
    const { data: d } = await admin
      .from("dancers")
      .select("stage_name, profile_id")
      .eq("id", a.dancer_id)
      .maybeSingle();
    let email: string | null = null;
    const recipientId = a.applicant_id ?? (d?.profile_id as string | null);
    if (recipientId) {
      const { data: u } = await admin.auth.admin.getUserById(recipientId);
      email = u?.user?.email ?? null;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || /\.con$/i.test(email)) {
      skipped++;
      continue;
    }
    const name = (d?.stage_name as string) ?? "지원자";
    const url = `${SITE}/s/${makeScheduleToken(scheduleId, a.dancer_id)}`;
    const mail = buildScheduleRequestEmail({
      name,
      scheduleLabel: sch.label as string,
      whenText,
      locationText: (sch.location as string | null) ?? null,
      url,
    });
    const r = await sendGmailEmail({ to: email, ...mail });
    if (r.ok) sent++;
    else skipped++;
  }

  return { ok: true, data: { sent, skipped } };
}

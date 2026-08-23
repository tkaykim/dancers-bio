"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getUser, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import {
  makeProjectSurveyToken,
  verifyProjectSurveyToken,
} from "@/lib/quick-token";
import { buildScheduleRequestEmail } from "@/lib/notify/schedule-mail";
import { projectLocale } from "@/lib/i18n/project-locale";
import {
  sendScheduleCancelAlimtalk,
  sendScheduleChangeAlimtalk,
  sendScheduleRequestAlimtalk,
} from "@/lib/alimtalk/dancer-events";
import { notify } from "@/lib/notify";
import { formatWhen } from "@/lib/format-when";
import { sendGmailEmail } from "@/lib/gmail";
import { getProjectApplicationScopeIds } from "@/lib/ops/project-application-scope";
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

// 알림톡 #{일정} 표시 텍스트: "리허설 · 6월 18일(수) 16:00" (날짜 없으면 라벨만).
function scheduleDisplayText(
  label: string,
  startsAt: string | null,
  endsAt: string | null,
  timeTbd: boolean,
): string {
  const when = formatWhen(startsAt, endsAt, timeTbd);
  return when === "일정 미정" ? label : `${label} · ${when}`;
}

// 일정 추가/취소 알림톡을 지원자 댄서(대기+수락, 중복 제거)에게 fan-out (best-effort).
// 폰 보유 댄서만, refId=scheduleId 멱등(일정 1건당 댄서별 1회). 실패는 본 액션을 막지 않음.
async function fanoutScheduleAlimtalk(
  kind: "change" | "cancel",
  args: { projectId: string; scheduleId: string; scheduleText: string },
): Promise<void> {
  // 안전 스위치: 기본 비활성화. 운영에서 SCHEDULE_ALIMTALK_ENABLED=true 로 켠다.
  // (템플릿/계정 env가 있어도 이 플래그가 없으면 일정 알림톡은 일절 안 나간다.)
  if (process.env.SCHEDULE_ALIMTALK_ENABLED !== "true") return;
  try {
    const admin = createAdminClient();
    const [{ data: proj }, scopeIds] = await Promise.all([
      admin.from("projects").select("title").eq("id", args.projectId).maybeSingle(),
      getProjectApplicationScopeIds(admin, args.projectId),
    ]);
    const projectTitle = (proj?.title as string) ?? "프로젝트";
    const { data: apps } = await admin
      .from("applications")
      .select("dancer_id")
      .in("project_id", scopeIds)
      .is("archived_at", null)
      .in("status", ["pending", "accepted"])
      .not("dancer_id", "is", null);

    const seen = new Set<string>();
    const dancerIds: string[] = [];
    for (const a of (apps ?? []) as Array<{ dancer_id: string }>) {
      if (!seen.has(a.dancer_id)) {
        seen.add(a.dancer_id);
        dancerIds.push(a.dancer_id);
      }
    }

    await Promise.all(
      dancerIds.map((dancerId) => {
        const payload = {
          dancerId,
          scheduleId: args.scheduleId,
          projectTitle,
          scheduleText: args.scheduleText,
          token: makeProjectSurveyToken(args.projectId, dancerId),
        };
        return kind === "change"
          ? sendScheduleChangeAlimtalk(payload)
          : sendScheduleCancelAlimtalk(payload);
      }),
    );
  } catch {
    // 알림톡 실패는 무시 (본 액션은 성공).
  }
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

  const startsRaw = strOrNull(fd, "starts_at");
  const timeTbd = fd.get("time_tbd") === "true" || !startsRaw;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_schedules")
    .insert({
      project_id: projectId,
      label,
      starts_at: isoOrNull(startsRaw),
      ends_at: timeTbd ? null : isoOrNull(strOrNull(fd, "ends_at")),
      location: strOrNull(fd, "location"),
      note: strOrNull(fd, "note"),
      time_tbd: timeTbd,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // 새 일정 추가 → 대기·수락 지원자에게 인앱 + 웹푸시 알림 (비치명적).
  // "일정이 추가됐어요, 가능여부를 알려주세요" — 이미 응답한 사람도 다시 인지 가능.
  await notifyScheduleAdded(projectId, label);

  // 추가된 일정 → 지원자에게 일정변경확인 알림톡 (폰 보유 시, best-effort).
  await fanoutScheduleAlimtalk("change", {
    projectId,
    scheduleId: data.id as string,
    scheduleText: scheduleDisplayText(
      label,
      isoOrNull(startsRaw),
      timeTbd ? null : isoOrNull(strOrNull(fd, "ends_at")),
      timeTbd,
    ),
  });

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { id: data.id as string } };
}

// 일정 추가 알림: 프로젝트의 대기+수락 지원자(중복 제거)에게 in-app+push.
async function notifyScheduleAdded(
  projectId: string,
  scheduleLabel: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const projectScopeIds = await getProjectApplicationScopeIds(admin, projectId);
    const [{ data: proj }, { data: apps }] = await Promise.all([
      admin
        .from("projects")
        .select("title, schedule_survey_code")
        .eq("id", projectId)
        .maybeSingle(),
      admin
        .from("applications")
        .select("applicant_id, dancer_id")
        .in("project_id", projectScopeIds)
        .is("archived_at", null)
        .in("status", ["pending", "accepted"]),
    ]);
    const recipientIds = new Set<string>();
    const danceronlyIds: string[] = [];
    for (const a of (apps ?? []) as Array<{
      applicant_id: string | null;
      dancer_id: string | null;
    }>) {
      if (a.applicant_id) recipientIds.add(a.applicant_id);
      else if (a.dancer_id) danceronlyIds.push(a.dancer_id);
    }
    // applicant_id 없는 다이렉트 제안 건은 클레임 댄서 계정(profile_id)로.
    if (danceronlyIds.length > 0) {
      const { data: ds } = await admin
        .from("dancers")
        .select("profile_id")
        .in("id", danceronlyIds)
        .not("profile_id", "is", null);
      for (const d of (ds ?? []) as Array<{ profile_id: string | null }>) {
        if (d.profile_id) recipientIds.add(d.profile_id);
      }
    }
    if (recipientIds.size === 0) return;

    const title = (proj?.title as string) ?? "프로젝트";
    const code = proj?.schedule_survey_code as string | null;
    const url = code ? `/sr/${code}` : `/projects/${projectId}`;
    await Promise.all(
      [...recipientIds].map((rid) =>
        notify({
          recipientId: rid,
          type: "project_session_reminder",
          payload: {
            kind: "schedule_added",
            project_id: projectId,
            project_title: title,
            schedule_label: scheduleLabel,
            url,
          },
          push: {
            title: "새 일정 안내",
            body: `${title} — 새 일정이 추가됐어요. 가능 여부를 알려주세요.`,
            url,
          },
        }),
      ),
    );
  } catch {
    // 알림 실패는 무시 (일정 추가 자체는 성공).
  }
}

export async function deleteScheduleAction(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("schedule_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (projectId && !(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  // 삭제 전 일정 정보 확보 (취소 통지 알림톡용 — 라벨·날짜·프로젝트).
  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select("label, starts_at, ends_at, time_tbd, project_id")
    .eq("id", id)
    .maybeSingle();

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("project_schedules")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };

  // 실제로 삭제된 경우에만 취소 통지 알림톡 (RLS로 0행 삭제 시 발송 안 함).
  const didDelete = Array.isArray(deleted) && deleted.length > 0;
  if (didDelete && sch?.project_id) {
    await fanoutScheduleAlimtalk("cancel", {
      projectId: sch.project_id as string,
      scheduleId: id,
      scheduleText: scheduleDisplayText(
        (sch.label as string) ?? "일정",
        sch.starts_at as string | null,
        sch.ends_at as string | null,
        Boolean(sch.time_tbd),
      ),
    });
  }

  if (projectId) revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

// 일정 상태 변경: 예정(tentative) / 확정(confirmed) / 취소됨(cancelled)
const SCHEDULE_STATUSES = new Set([
  "undecided",
  "tentative",
  "confirmed",
  "cancelled",
]);

export async function updateScheduleStatusAction(
  fd: FormData,
): Promise<ActionResult<{ status: string }>> {
  await requireUser();
  const id = (fd.get("schedule_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const status = (fd.get("status") ?? "").toString().trim();
  if (!id || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!SCHEDULE_STATUSES.has(status))
    return { ok: false, error: "상태값을 확인해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("project_schedules")
    .update({ status })
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id, label, starts_at, ends_at, time_tbd")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  // '취소됨'으로 전환되면 취소 통지 알림톡 (kill-switch·멱등 적용 — 삭제 통지와 중복 안 됨).
  if (status === "cancelled" && updated) {
    await fanoutScheduleAlimtalk("cancel", {
      projectId,
      scheduleId: id,
      scheduleText: scheduleDisplayText(
        (updated.label as string) ?? "일정",
        updated.starts_at as string | null,
        updated.ends_at as string | null,
        Boolean(updated.time_tbd),
      ),
    });
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { status } };
}

// 특정 일정의 응답자 명단 (관리자용)
export async function getScheduleRespondersAction(
  scheduleId: string,
): Promise<
  ActionResult<
    Array<{
      dancer_id: string;
      name: string;
      status: string;
      note: string | null;
      is_active: boolean;
    }>
  >
> {
  await requireUser();
  const supabase = await createClient();
  // RLS(psr_select)가 관리권한 보장
  const { data, error } = await supabase
    .from("project_schedule_responses")
    .select(
      "dancer_id, status, note, is_active, dancer:dancers!project_schedule_responses_dancer_id_fkey ( stage_name )",
    )
    .eq("schedule_id", scheduleId)
    .order("status");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as Array<{
    dancer_id: string;
    status: string;
    note: string | null;
    is_active: boolean | null;
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
        is_active: r.is_active ?? true,
      };
    }),
  };
}

// 응답자(가능자) 활성/비활성 토글 — 이 일정 후보에서 포함/제외(기록은 보존).
// scheduleId로 프로젝트를 역참조해 canManageProject 게이트 후 admin 클라이언트로 갱신.
export async function setScheduleResponderActiveAction(
  fd: FormData,
): Promise<ActionResult<{ is_active: boolean }>> {
  await requireUser();
  const scheduleId = (fd.get("schedule_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const isActive = (fd.get("is_active") ?? "").toString() === "1";
  if (!scheduleId || !dancerId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select("project_id")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sch?.project_id) return { ok: false, error: "일정을 찾을 수 없습니다." };
  if (!(await canManageProject(sch.project_id as string)))
    return { ok: false, error: "권한이 없습니다." };

  const { error } = await admin
    .from("project_schedule_responses")
    .update({ is_active: isActive })
    .eq("schedule_id", scheduleId)
    .eq("dancer_id", dancerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${sch.project_id as string}/applicants`);
  return { ok: true, data: { is_active: isActive } };
}

// 여러 일정 응답을 한 (projectId, dancerId)로 일괄 upsert. 코드/토큰 경로 공용.
type ScheduleAnswer = {
  schedule_id: string;
  status: "available" | "partial" | "unavailable";
  time_slots?: unknown;
  note?: string | null;
};

function parseAnswers(fd: FormData): ScheduleAnswer[] {
  let answers: ScheduleAnswer[] = [];
  try {
    const parsed = JSON.parse((fd.get("answers") ?? "[]").toString());
    if (Array.isArray(parsed)) answers = parsed as ScheduleAnswer[];
  } catch {
    answers = [];
  }
  return answers.filter(
    (a) =>
      a &&
      typeof a.schedule_id === "string" &&
      ["available", "partial", "unavailable"].includes(a.status),
  );
}

async function upsertScheduleAnswers(
  projectId: string,
  dancerId: string,
  answers: ScheduleAnswer[],
): Promise<ActionResult<{ saved: number }>> {
  const admin = createAdminClient();
  // 이 프로젝트의 "취합 대상" 일정만 허용 (타프로젝트·비취합 확정일정 위조 방지)
  const { data: schRows } = await admin
    .from("project_schedules")
    .select("id")
    .eq("project_id", projectId)
    .eq("collect_availability", true);
  const allowed = new Set((schRows ?? []).map((s: { id: string }) => s.id));

  const now = new Date().toISOString();
  const rows = answers
    .filter((a) => allowed.has(a.schedule_id))
    .map((a) => ({
      schedule_id: a.schedule_id,
      dancer_id: dancerId,
      status: a.status,
      time_slots: a.status === "partial" ? (a.time_slots ?? null) : null,
      note: (a.note ?? "").toString().trim() || null,
      responded_at: now,
    }));
  if (rows.length === 0) return { ok: false, error: "유효한 일정이 없습니다." };

  const { error } = await admin
    .from("project_schedule_responses")
    .upsert(rows, { onConflict: "schedule_id,dancer_id" });
  if (error) return { ok: false, error: "저장에 실패했습니다." };
  return { ok: true, data: { saved: rows.length } };
}

// 메일 개인 매직링크용: 토큰으로 본인 식별, 로그인 없이 전체 일정 일괄 제출.
export async function submitProjectScheduleResponsesByTokenAction(
  fd: FormData,
): Promise<ActionResult<{ saved: number }>> {
  const token = (fd.get("token") ?? "").toString();
  const v = verifyProjectSurveyToken(token);
  if (!v) return { ok: false, error: "링크가 유효하지 않습니다." };
  const answers = parseAnswers(fd);
  if (answers.length === 0)
    return { ok: false, error: "각 일정의 가능 여부를 선택해 주세요." };
  return upsertScheduleAnswers(v.projectId, v.dancerId, answers);
}

// 단톡방 공유 링크용: 로그인된 본인 계정으로 여러 일정 가능여부를 한 번에 제출.
// code = projects.schedule_survey_code (프로젝트 단위 설문 코드)
export async function submitProjectScheduleResponsesAction(
  fd: FormData,
): Promise<ActionResult<{ saved: number }>> {
  const code = (fd.get("code") ?? "").toString().trim();
  if (!code) return { ok: false, error: "링크가 유효하지 않습니다." };
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const answers = parseAnswers(fd);
  if (answers.length === 0)
    return { ok: false, error: "각 일정의 가능 여부를 선택해 주세요." };

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("schedule_survey_code", code)
    .maybeSingle();
  if (!project) return { ok: false, error: "설문을 찾을 수 없습니다." };
  const projectId = project.id as string;

  const dancerId = await resolveDancerIdForUserInProject(projectId, user.id);
  if (!dancerId)
    return {
      ok: false,
      error:
        "이 프로젝트에 지원한 기록이 없어요. 지원하신 계정으로 로그인했는지 확인해 주세요.",
    };

  return upsertScheduleAnswers(projectId, dancerId, answers);
}

// 가능여부 요청 메일 발송 (프로젝트 단위). 사람당 한 통에 전체 일정 + 개인 매직링크.
// 메일 버튼 → /s/<token> (로그인 생략, 토큰으로 본인 식별) → 단톡방 설문과 동일 UI.
export async function sendProjectScheduleRequestsAction(
  fd: FormData,
): Promise<ActionResult<{ sent: number; skipped: number }>> {
  await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const projectScopeIds = await getProjectApplicationScopeIds(admin, projectId);
  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  // 영문 공고면 참여자도 외국인이다 — 안내 메일을 공고 언어로 보낸다.
  const locale = await projectLocale(projectId);

  const { data: schRows } = await admin
    .from("project_schedules")
    .select("label, starts_at, ends_at, time_tbd")
    .eq("project_id", projectId)
    .eq("collect_availability", true)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const schedules = (schRows ?? []) as Array<{
    label: string;
    starts_at: string | null;
    ends_at: string | null;
    time_tbd: boolean;
  }>;
  if (schedules.length === 0)
    return { ok: false, error: "발송할 일정이 없습니다." };
  const mailSchedules = schedules.map((s) => ({
    label: s.label,
    whenText: formatWhen(s.starts_at, s.ends_at, s.time_tbd),
    locationText: null, // 지원자 메일에는 장소 비노출 (대외비)
  }));

  // 대상: 탈락 제외(대기+수락) 지원자, 댄서별 중복 제거
  const { data: apps } = await admin
    .from("applications")
    .select("dancer_id, applicant_id, status")
    .in("project_id", projectScopeIds)
    .is("archived_at", null)
    .in("status", ["pending", "accepted"])
    .not("dancer_id", "is", null);

  const seen = new Set<string>();
  const targets = (apps ?? []).filter((a: { dancer_id: string }) => {
    if (seen.has(a.dancer_id)) return false;
    seen.add(a.dancer_id);
    return true;
  });

  let sent = 0;
  let skipped = 0;
  for (const a of targets as Array<{
    dancer_id: string;
    applicant_id: string | null;
  }>) {
    const { data: d } = await admin
      .from("dancers")
      .select("stage_name, profile_id")
      .eq("id", a.dancer_id)
      .maybeSingle();
    const name = (d?.stage_name as string) ?? "지원자";
    const surveyToken = makeProjectSurveyToken(projectId, a.dancer_id);

    // 일정 확인 알림톡 — 폰 보유 시 발송(이메일 유무와 독립, best-effort).
    await sendScheduleRequestAlimtalk({
      dancerId: a.dancer_id,
      projectId,
      projectTitle: project.title as string,
      token: surveyToken,
    });

    let email: string | null = null;
    const recipientId = a.applicant_id ?? (d?.profile_id as string | null);
    if (recipientId) {
      const { data: u } = await admin.auth.admin.getUserById(recipientId);
      email = u?.user?.email ?? null;
    }
    if (
      !email ||
      !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) ||
      /\.con$/i.test(email)
    ) {
      skipped++;
      continue;
    }
    const url = `${SITE}/s/${surveyToken}`;
    const mail = buildScheduleRequestEmail({
      name,
      projectTitle: project.title as string,
      schedules: mailSchedules,
      url,
      locale,
    });
    const r = await sendGmailEmail({ to: email, ...mail });
    if (r.ok) sent++;
    else skipped++;
  }

  return { ok: true, data: { sent, skipped } };
}

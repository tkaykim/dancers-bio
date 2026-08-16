"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { normalizeRounds } from "@/lib/application-stage";
import type { ActionResult } from "./auth";

const VALID_AUDIENCES = new Set(["public", "pending", "accepted", "rejected"]);

// 공지 등록 → 열람대상 지원자에게 인앱 + 웹푸시 알림 (비치명적, 알림톡 없음).
// 대상 = audiences 에 해당하는 지원상태의 본인계정. 'public' 포함 시 전체 지원자.
async function notifyAnnouncementAudience(args: {
  projectId: string;
  title: string | null;
  body: string;
  audiences: string[];
}): Promise<void> {
  try {
    const statuses = args.audiences.includes("public")
      ? ["pending", "accepted", "rejected"]
      : args.audiences.filter((a) => a !== "public");
    if (statuses.length === 0) return;

    const admin = createAdminClient();
    const [{ data: proj }, { data: apps }] = await Promise.all([
      admin.from("projects").select("title").eq("id", args.projectId).maybeSingle(),
      admin
        .from("applications")
        .select("applicant_id")
        .eq("project_id", args.projectId)
        .is("archived_at", null)
        .in("status", statuses)
        .not("applicant_id", "is", null),
    ]);
    const ids = Array.from(
      new Set(
        ((apps ?? []) as Array<{ applicant_id: string | null }>)
          .map((a) => a.applicant_id)
          .filter((v): v is string => !!v),
      ),
    );
    if (ids.length === 0) return;

    const projectTitle = (proj?.title as string) ?? "프로젝트";
    const url = `/projects/${args.projectId}`;
    const preview = (args.title || args.body).slice(0, 50);
    await Promise.all(
      ids.map((rid) =>
        notify({
          recipientId: rid,
          type: "announcement_posted",
          payload: {
            project_id: args.projectId,
            project_title: projectTitle,
            title: args.title,
            url,
          },
          push: { title: `${projectTitle} 공지`, body: preview, url },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyAnnouncementAudience] failed (non-fatal):", err);
  }
}

function parseAudiences(fd: FormData): string[] {
  const raw = fd.getAll("audiences").map((v) => v.toString());
  return Array.from(new Set(raw.filter((v) => VALID_AUDIENCES.has(v))));
}

function text(fd: FormData, key: string, max: number): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v ? v.slice(0, max) : null;
}

export async function createAnnouncementAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const body = text(fd, "body", 4000);
  const title = text(fd, "title", 200);
  const audiences = parseAudiences(fd);
  const pinned = fd.get("pinned") === "true";

  if (!projectId || !body)
    return { ok: false, error: "공지 내용을 입력해 주세요." };
  if (!title)
    return { ok: false, error: "공지 제목을 입력해 주세요." };
  if (audiences.length === 0)
    return { ok: false, error: "열람 대상을 한 개 이상 선택해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_announcements")
    .insert({
      project_id: projectId,
      title,
      body,
      audiences,
      pinned,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // 열람대상에게 인앱 + 웹푸시 알림 (비치명적).
  await notifyAnnouncementAudience({ projectId, title, body, audiences });

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { id: data.id as string } };
}

// 공지를 메일로도 보낸다. 인앱·푸시와 달리 자동이 아니고, 운영자가 명시적으로 누를 때만 나간다.
//
// 대상 키
//   all       — 철회를 제외한 전체 지원자
//   pending   — 검토 중
//   rejected  — 불합격·본인 포기
//   round:N   — N차 통과자 (마지막 단계는 confirmed 인 사람만 = 최종 합격자)
//
// 같은 공지를 같은 사람에게 두 번 보내지 않는다 — project_notification_log 가 멱등키다.
export async function sendAnnouncementEmailAction(
  fd: FormData,
): Promise<ActionResult<{ sent: number; skipped: number; targeted: number }>> {
  await requireUser();
  const announcementId = (fd.get("announcement_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const audiences = fd
    .getAll("email_audiences")
    .map((v) => v.toString().trim())
    .filter(Boolean);
  if (!announcementId || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (audiences.length === 0)
    return { ok: false, error: "받는 대상을 한 개 이상 선택해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const [{ data: ann }, { data: project }, { data: rows }] = await Promise.all([
    admin
      .from("project_announcements")
      .select("id, title, body, deleted_at, email_sent_count")
      .eq("id", announcementId)
      .eq("project_id", projectId)
      .maybeSingle(),
    admin
      .from("projects")
      .select("title, selection_rounds")
      .eq("id", projectId)
      .maybeSingle(),
    admin
      .from("applications")
      .select("applicant_id, dancer_id, status, passed_round, confirmed_at")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .limit(1000),
  ]);
  if (!ann || ann.deleted_at) return { ok: false, error: "공지를 찾을 수 없습니다." };

  const totalRounds = normalizeRounds(
    (project?.selection_rounds as number | null) ?? null,
  );
  type Row = {
    applicant_id: string | null;
    dancer_id: string | null;
    status: string;
    passed_round: number | null;
    confirmed_at: string | null;
  };
  const matches = (row: Row): boolean =>
    audiences.some((key) => {
      if (key === "all") return row.status !== "withdrawn";
      if (key === "pending") return row.status === "pending";
      if (key === "rejected")
        return row.status === "rejected" || row.status === "declined";
      if (key.startsWith("round:")) {
        const want = Number(key.slice("round:".length));
        if (row.status !== "accepted") return false;
        const passed = Math.max(Number(row.passed_round ?? 0), 1);
        // 마지막 단계는 확정(confirmed)까지 된 사람만 최종 합격자로 본다.
        if (want >= totalRounds) return passed >= totalRounds && !!row.confirmed_at;
        return passed === want;
      }
      return false;
    });

  const targets = ((rows ?? []) as Row[]).filter(
    (r) => r.applicant_id && matches(r),
  );
  if (targets.length === 0)
    return { ok: false, error: "조건에 해당하는 지원자가 없습니다." };

  const { sendAnnouncementEmail } = await import("@/lib/notify/announcement-mail");
  const channel = `announce_${announcementId.slice(0, 8)}`;
  let sent = 0;
  let skipped = 0;
  for (const row of targets) {
    try {
      const res = await sendAnnouncementEmail({
        applicantId: row.applicant_id,
        dancerId: row.dancer_id,
        projectId,
        projectTitle: (project?.title as string | null) ?? "",
        title: (ann.title as string | null) ?? "",
        body: (ann.body as string) ?? "",
        channel,
      });
      if (res.ok && !res.skipped) sent++;
      else skipped++;
    } catch (e) {
      console.error("[announcement-mail] 발송 실패:", e);
      skipped++;
    }
  }

  await admin
    .from("project_announcements")
    .update({
      email_sent_at: new Date().toISOString(),
      email_sent_count: ((ann.email_sent_count as number | null) ?? 0) + sent,
      email_audiences: audiences,
    })
    .eq("id", announcementId);

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { sent, skipped, targeted: targets.length } };
}

export async function updateAnnouncementAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("announcement_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const body = text(fd, "body", 4000);
  const title = text(fd, "title", 200);
  const audiences = parseAudiences(fd);
  const pinned = fd.get("pinned") === "true";

  if (!id || !projectId || !body)
    return { ok: false, error: "공지 내용을 입력해 주세요." };
  if (audiences.length === 0)
    return { ok: false, error: "열람 대상을 한 개 이상 선택해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_announcements")
    .update({
      title,
      body,
      audiences,
      pinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

export async function deleteAnnouncementAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("announcement_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!id || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_announcements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

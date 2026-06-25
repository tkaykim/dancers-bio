"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import type { ActionResult } from "./auth";

// 날짜(YYYY-MM-DD) → 당일 23:59:59 KST. 빈값/무효 → null.
function toExpiry(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T23:59:59+09:00`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// 운영보드 접근 권한 신청 (로그인한 누구나). 이미 권한 있으면 no-op.
export async function requestEventAccessAction(
  formData: FormData,
): Promise<ActionResult<{ status: "approved" | "pending" }>> {
  const user = await requireUser();
  const opsCode = (formData.get("ops_code") ?? "").toString().trim();
  const message = (formData.get("message") ?? "").toString().trim().slice(0, 500);
  if (!opsCode) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("project_events")
    .select("id, project_id, name")
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!ev) return { ok: false, error: "운영일정을 찾을 수 없습니다." };
  const eventId = ev.id as string;
  const projectId = ev.project_id as string;

  // 이미 권한 보유 시 신청 불필요.
  if (await canManageProject(projectId)) return { ok: true, data: { status: "approved" } };
  const { data: staffRow } = await admin
    .from("event_staff")
    .select("id, expires_at")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (
    staffRow &&
    (!staffRow.expires_at || new Date(staffRow.expires_at as string) > new Date())
  ) {
    return { ok: true, data: { status: "approved" } };
  }

  // 대기중 신청이 있으면 메시지만 갱신, 없으면 생성.
  const { data: existing } = await admin
    .from("event_access_requests")
    .select("id")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    await admin.from("event_access_requests").update({ message }).eq("id", existing.id);
    return { ok: true, data: { status: "pending" } };
  }
  const { error } = await admin.from("event_access_requests").insert({
    event_id: eventId,
    profile_id: user.id,
    message,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") return { ok: true, data: { status: "pending" } };
    return { ok: false, error: error.message };
  }

  // 관리권한자(소유자 + 공동관리자)에게 알림.
  try {
    const recipients = new Set<string>();
    const { data: proj } = await admin
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (proj?.owner_id) recipients.add(proj.owner_id as string);
    const { data: mgrs } = await admin
      .from("project_managers")
      .select("profile_id")
      .eq("project_id", projectId);
    for (const m of (mgrs ?? []) as Array<{ profile_id: string | null }>) {
      if (m.profile_id) recipients.add(m.profile_id);
    }
    recipients.delete(user.id);
    const { data: me } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const requesterName = (me?.display_name as string) ?? "누군가";
    const eventName = (ev.name as string) ?? "운영보드";
    const url = `/ops/events/${opsCode}`;
    await Promise.all(
      [...recipients].map((rid) =>
        notify({
          recipientId: rid,
          type: "ops_access_requested",
          payload: {
            event_id: eventId,
            ops_code: opsCode,
            event_name: eventName,
            requester_id: user.id,
            requester_name: requesterName,
            project_id: projectId,
            url,
          },
          push: {
            title: "운영보드 접근 신청",
            body: `${requesterName}님이 '${eventName}' 접근을 신청했습니다.`,
            url,
          },
        }),
      ),
    );
  } catch {
    // 알림 실패는 비치명적.
  }

  return { ok: true, data: { status: "pending" } };
}

// 접근 신청 승인/거절 (관리권한자). 승인 시 만료일 필수 → event_staff 등록.
export async function decideEventAccessRequestAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const requestId = (formData.get("request_id") ?? "").toString().trim();
  const decision = (formData.get("decision") ?? "").toString().trim();
  const expiresRaw = (formData.get("expires_at") ?? "").toString();
  if (!requestId || (decision !== "approve" && decision !== "deny")) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const admin = createAdminClient();
  const { data: req } = await admin
    .from("event_access_requests")
    .select("id, event_id, profile_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "신청을 찾을 수 없습니다." };
  const { data: ev } = await admin
    .from("project_events")
    .select("project_id, ops_code, name")
    .eq("id", req.event_id as string)
    .maybeSingle();
  if (!ev) return { ok: false, error: "운영일정을 찾을 수 없습니다." };
  if (!(await canManageProject(ev.project_id as string))) {
    return { ok: false, error: "권한이 없습니다." };
  }
  if (req.status !== "pending") return { ok: false, error: "이미 처리된 신청입니다." };

  const nowIso = new Date().toISOString();
  const opsCode = ev.ops_code as string;

  if (decision === "deny") {
    await admin
      .from("event_access_requests")
      .update({ status: "denied", decided_at: nowIso, decided_by: user.id })
      .eq("id", requestId);
    revalidatePath(`/ops/events/${opsCode}`);
    return { ok: true };
  }

  // 승인 → 만료일 필수.
  const expiresAt = toExpiry(expiresRaw);
  if (!expiresAt) return { ok: false, error: "권한 만료일을 지정해 주세요." };

  const { error: staffErr } = await admin
    .from("event_staff")
    .upsert(
      {
        event_id: req.event_id as string,
        profile_id: req.profile_id as string,
        role: "staff",
        expires_at: expiresAt,
        added_by: user.id,
      },
      { onConflict: "event_id,profile_id" },
    );
  if (staffErr) return { ok: false, error: staffErr.message };

  await admin
    .from("event_access_requests")
    .update({ status: "approved", decided_at: nowIso, decided_by: user.id })
    .eq("id", requestId);

  try {
    const eventName = (ev.name as string) ?? "운영보드";
    const url = `/ops/events/${opsCode}`;
    await notify({
      recipientId: req.profile_id as string,
      type: "ops_access_granted",
      payload: { event_id: req.event_id, ops_code: opsCode, event_name: eventName, url },
      push: {
        title: "운영보드 접근 승인",
        body: `'${eventName}' 운영보드 접근이 승인되었습니다.`,
        url,
      },
    });
  } catch {
    // 비치명적
  }

  revalidatePath(`/ops/events/${opsCode}`);
  return { ok: true };
}

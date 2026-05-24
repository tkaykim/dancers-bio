"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bugReportSchema, type BugReportInput } from "@/lib/validation/bug-report";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";
import type { ActionResult } from "./auth";

export async function submitBugReportAction(
  input: BugReportInput,
): Promise<ActionResult<{ id: string; emailed: boolean }>> {
  const parsed = bugReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  const data = parsed.data;

  const supabase = await createClient();
  // Figure out who's reporting (optional)
  const { data: { user } } = await supabase.auth.getUser();
  let role: string = "guest";
  let email: string | null = data.reporter_email || user?.email || null;
  if (user) {
    role = "user";
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_admin) role = "admin";
  }

  const insertPayload = {
    reporter_user_id: user?.id ?? null,
    reporter_email: email,
    reporter_role: role,
    title: data.title,
    description: data.description,
    severity: data.severity,
    page_url: data.page_url || null,
    user_agent: data.user_agent || null,
    status: "open",
  };

  const { data: row, error } = await supabase
    .from("bug_reports")
    .insert(insertPayload)
    .select("id, created_at")
    .single();

  if (error || !row) {
    console.error("[bug-report] insert failed:", error?.message);
    return { ok: false, error: "리포트 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const mail = await sendBugReportEmail({
    id: row.id as string,
    title: data.title,
    description: data.description,
    severity: data.severity,
    reporter_email: email,
    reporter_role: role,
    page_url: data.page_url || null,
    user_agent: data.user_agent || null,
    created_at: (row as { created_at: string }).created_at,
  });

  // Mark mail status (best-effort, do not fail the action).
  // bug_reports_update_admin RLS 가 admin 만 허용하므로 service-role 사용 — 시스템 트래킹 컬럼.
  try {
    const admin = createAdminClient();
    const { error: updErr } = await admin
      .from("bug_reports")
      .update({
        emailed_at: mail.ok ? new Date().toISOString() : null,
        email_error: mail.ok ? null : (mail.error ?? "unknown"),
      })
      .eq("id", row.id);
    if (updErr) {
      console.warn("[bug-report] status update failed:", updErr.message);
    }
  } catch (err) {
    // service-role 키 누락 등은 메일 발송 자체엔 영향 없음. status 만 못 남기고 통과.
    console.warn("[bug-report] admin client unavailable:", (err as Error).message);
  }

  return { ok: true, data: { id: row.id as string, emailed: mail.ok } };
}

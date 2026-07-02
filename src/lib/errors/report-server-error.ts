import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";

/**
 * 시스템 자동 에러 리포트 → 기존 `bug_reports` 파이프라인에 저장(+관리자 메일).
 *
 * - service-role(admin) 클라이언트로 저장하므로, "세션 만료로 저장 실패" 같은
 *   상황에서도 리포트는 확실히 남는다. (사용자에게 보이는 실패의 진짜 원인을 보존)
 * - 1시간 내 동일 title 은 새 행 대신 occurrence_count 만 올려 메일 스팸을 막는다.
 * - 절대 throw 하지 않는다. 리포터가 본래 흐름(사용자 요청)을 깨면 안 되므로.
 * - 사용자에게 노출한 안내 문구(userMessage)와, 내부 원인(detail)을 분리 저장한다.
 */
export type ServerErrorReport = {
  /** 발생 영역. 예: "dancer_onboarding" */
  area: string;
  /** 짧은 기계용 코드. 예: "validation", "rls_denied", "insert_failed", "photo_invalid" */
  code: string;
  /** 내부 원인 상세(원문 에러 등). 사용자에게는 보이지 않음. */
  detail: string;
  /** 사용자에게 실제로 보여준 안내 문구(있으면 함께 기록). */
  userMessage?: string;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  pageUrl?: string | null;
  /** 재현/수정에 도움이 되는 부가 정보(민감정보·토큰 금지). */
  meta?: Record<string, unknown>;
  severity?: "low" | "normal" | "high" | "critical";
};

export async function reportServerError(report: ServerErrorReport): Promise<void> {
  try {
    const admin = createAdminClient();

    const title = `[자동/${report.area}] ${report.code}`.slice(0, 160);
    const description = [
      `area: ${report.area}`,
      `code: ${report.code}`,
      report.userMessage ? `사용자에게 보인 안내: ${report.userMessage}` : "",
      `내부 원인: ${report.detail}`,
      report.meta ? `\n--- meta ---\n${JSON.stringify(report.meta, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    const severity = report.severity ?? "normal";
    const nowIso = new Date().toISOString();

    // 1시간 내 동일 title 중복 → occurrence_count 만 증가(메일 재발송 안 함).
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await admin
      .from("bug_reports")
      .select("id, occurrence_count")
      .eq("title", title)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      await admin
        .from("bug_reports")
        .update({
          occurrence_count: ((recent.occurrence_count as number | null) ?? 1) + 1,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", recent.id);
      return;
    }

    const { data: row } = await admin
      .from("bug_reports")
      .insert({
        reporter_user_id: report.userId ?? null,
        reporter_email: report.userEmail ?? null,
        reporter_role: "system",
        title,
        description,
        severity,
        status: "open",
        page_url: report.pageUrl ?? null,
        user_agent: report.userAgent ?? null,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      })
      .select("id, created_at")
      .single();

    if (!row) return;

    // 관리자 메일(베스트-에포트). 실패해도 무시.
    try {
      const mail = await sendBugReportEmail({
        id: row.id as string,
        title,
        description,
        severity,
        reporter_email: report.userEmail ?? null,
        reporter_role: "system",
        page_url: report.pageUrl ?? null,
        user_agent: report.userAgent ?? null,
        created_at: (row as { created_at: string }).created_at,
      });
      await admin
        .from("bug_reports")
        .update({
          emailed_at: mail.ok ? new Date().toISOString() : null,
          email_error: mail.ok ? null : (mail.error ?? "unknown"),
        })
        .eq("id", row.id);
    } catch {
      // 메일 실패는 리포트 저장에 영향 없음.
    }
  } catch {
    // 리포터 자체가 사용자 흐름을 깨면 안 된다.
  }
}

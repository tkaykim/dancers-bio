import "server-only";
import { sendGmailEmail } from "@/lib/gmail";

const RECIPIENT = process.env.BUG_REPORT_TO || "dancers.bio.kr@gmail.com";

const SEVERITY_BADGE: Record<string, { label: string; bg: string }> = {
  critical: { label: "Critical", bg: "#dc2626" },
  high: { label: "High", bg: "#ea580c" },
  normal: { label: "Normal", bg: "#0ea5e9" },
  low: { label: "Low", bg: "#64748b" },
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface BugReportEmail {
  id: string;
  title: string;
  description: string;
  severity: string;
  reporter_email: string | null;
  reporter_role: string | null;
  page_url: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function sendBugReportEmail(report: BugReportEmail): Promise<{
  ok: boolean;
  error?: string;
}> {
  const sev = SEVERITY_BADGE[report.severity] ?? SEVERITY_BADGE.normal;
  const ts = new Date(report.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
  const subject = `[dancers.bio 버그] ${report.title.slice(0, 100)}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#666;width:120px;vertical-align:top;">${label}</td><td style="padding:6px 12px;font-size:13px;word-break:break-all;">${escapeHtml(value)}</td></tr>`;

  const html = `
  <div style="max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',sans-serif;color:#222;">
    <div style="background:#18181b;padding:20px 24px;">
      <h1 style="color:#fff;margin:0;font-size:18px;letter-spacing:-0.01em;">🐞 dancers.bio 버그 리포트</h1>
      <p style="color:#a1a1aa;margin:6px 0 0;font-size:12px;">
        <span style="background:${sev.bg};color:#fff;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:600;">${sev.label}</span>
        &nbsp;&nbsp;${ts} KST
      </p>
    </div>
    <div style="padding:20px 24px;background:#fff;">
      <div style="background:#fafafa;border-left:4px solid #18181b;padding:14px 16px;margin-bottom:18px;border-radius:0 8px 8px 0;">
        <div style="font-weight:700;font-size:15px;color:#18181b;margin-bottom:6px;">${escapeHtml(report.title)}</div>
        <div style="font-size:13px;line-height:1.7;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(report.description)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:6px;overflow:hidden;">
        ${row("Reporter", `${report.reporter_email ?? "익명"} (${report.reporter_role ?? "guest"})`)}
        ${row("Page URL", report.page_url ?? "-")}
        ${row("User Agent", report.user_agent ?? "-")}
        ${row("Report ID", report.id)}
      </table>
      <p style="margin:18px 0 0;font-size:12px;color:#71717a;">
        DB에서 처리:
        <code style="background:#f4f4f5;padding:2px 6px;border-radius:3px;">SELECT * FROM bug_reports WHERE id = '${report.id}';</code>
      </p>
    </div>
    <div style="background:#fafafa;padding:12px 24px;text-align:center;font-size:11px;color:#a1a1aa;">
      dancers.bio 자동 버그 리포트 시스템
    </div>
  </div>`;

  const text = [
    `[dancers.bio 버그] ${report.title}`,
    `Severity: ${sev.label}`,
    `Time: ${ts} KST`,
    "",
    "---",
    report.description,
    "---",
    "",
    `Reporter: ${report.reporter_email ?? "익명"} (${report.reporter_role ?? "guest"})`,
    `URL: ${report.page_url ?? "-"}`,
    `User Agent: ${report.user_agent ?? "-"}`,
    `Report ID: ${report.id}`,
  ].join("\n");

  return await sendGmailEmail({
    to: RECIPIENT,
    subject,
    text,
    html,
    replyTo: report.reporter_email ?? undefined,
  });
}

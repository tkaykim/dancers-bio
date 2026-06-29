import "server-only";
import { sendGmailEmail } from "@/lib/gmail";

// 새 E-6-1 비자 온보딩 신청 알림 → 운영자. /visa/apply 제출 시 비치명적으로 호출.
const RECIPIENT = process.env.VISA_APPLICATION_TO || "dancers.bio.kr@gmail.com";

const SKILL_LABEL: Record<number, string> = {
  1: "트레이닝 필요 (needs training)",
  2: "어느 정도 경력 (some experience)",
  3: "현장 투입 준비 (site-ready)",
  4: "안무·무대 경험 (choreo & stage exp.)",
};

const KOREAN_LABEL: Record<string, string> = {
  none: "전혀 못함 (none)",
  some: "어느 정도 (some)",
  fluent: "유창·의사소통 문제없음 (fluent)",
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface VisaApplicationEmail {
  id: string;
  name: string;
  stage_name: string | null;
  nationality: string | null;
  has_visa: boolean | null;
  visa_label: string | null;
  skill_level: number | null;
  korean_level: string | null;
  email: string;
  contacts: { type: string; handle: string }[];
  currently_in_korea: boolean | null;
  has_residence_in_korea: boolean | null;
  residence_region: string | null;
  available_entry_date: string | null;
  dance_video_url: string | null;
  preferred_lang: string | null;
  profile_url: string | null;
  created_at: string;
}

export async function sendVisaApplicationEmail(app: VisaApplicationEmail): Promise<{
  ok: boolean;
  error?: string;
}> {
  const ts = new Date(app.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
  const subject = `[deetz 비자신청] ${app.stage_name || app.name} (${app.nationality ?? "국적 미상"})`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#666;width:130px;vertical-align:top;">${label}</td><td style="padding:6px 12px;font-size:13px;word-break:break-all;">${value}</td></tr>`;

  const visaStatus =
    app.has_visa == null
      ? "-"
      : app.has_visa
        ? `있음 — ${escapeHtml(app.visa_label ?? "")}`
        : "없음 / 신청 예정";
  const contactsHtml =
    app.contacts.length > 0
      ? app.contacts
          .map((c) => `${escapeHtml(c.type)}: ${escapeHtml(c.handle)}`)
          .join("<br>")
      : "-";
  const residence = app.has_residence_in_korea
    ? `있음${app.residence_region ? ` (${escapeHtml(app.residence_region)})` : ""}`
    : "없음";
  const video = app.dance_video_url
    ? `<a href="${escapeHtml(app.dance_video_url)}" style="color:#2563eb;">${escapeHtml(app.dance_video_url)}</a>`
    : "-";
  const profile = app.profile_url
    ? `<a href="${escapeHtml(app.profile_url)}" style="color:#2563eb;">${escapeHtml(app.profile_url)}</a>`
    : "-";

  const html = `
  <div style="max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',sans-serif;color:#222;">
    <div style="background:#18181b;padding:20px 24px;">
      <h1 style="color:#fff;margin:0;font-size:18px;letter-spacing:-0.01em;">deetz · 새 비자(E-6-1) 신청</h1>
      <p style="color:#a1a1aa;margin:6px 0 0;font-size:12px;">${ts} KST · 언어 ${escapeHtml(app.preferred_lang ?? "-")}</p>
    </div>
    <div style="padding:20px 24px;background:#fff;">
      <div style="background:#fafafa;border-left:4px solid #18181b;padding:14px 16px;margin-bottom:18px;border-radius:0 8px 8px 0;">
        <div style="font-weight:700;font-size:15px;color:#18181b;">${escapeHtml(app.stage_name || app.name)}</div>
        <div style="font-size:13px;color:#3f3f46;margin-top:2px;">${escapeHtml(app.name)} · ${escapeHtml(app.nationality ?? "국적 미상")}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:6px;overflow:hidden;">
        ${row("비자 현황", visaStatus)}
        ${row("실력 자기진단", app.skill_level ? escapeHtml(SKILL_LABEL[app.skill_level] ?? String(app.skill_level)) : "-")}
        ${row("한국어 수준", app.korean_level ? escapeHtml(KOREAN_LABEL[app.korean_level] ?? app.korean_level) : "-")}
        ${row("이메일", escapeHtml(app.email))}
        ${row("메신저", contactsHtml)}
        ${row("현재 위치", app.currently_in_korea == null ? "-" : app.currently_in_korea ? "한국" : "자국")}
        ${row("한국 거주지", residence)}
        ${row("입국 가능일", escapeHtml(app.available_entry_date ?? "-"))}
        ${row("댄스 영상", video)}
        ${row("프로필 링크", profile)}
        ${row("신청 ID", escapeHtml(app.id))}
      </table>
      <p style="margin:18px 0 0;font-size:12px;color:#71717a;">
        운영 화면에서 처리: <a href="https://deetz.kr/admin/visa" style="color:#2563eb;">deetz.kr/admin/visa</a>
      </p>
    </div>
    <div style="background:#fafafa;padding:12px 24px;text-align:center;font-size:11px;color:#a1a1aa;">
      deetz 비자 온보딩 자동 알림
    </div>
  </div>`;

  const text = [
    `[deetz 비자신청] ${app.stage_name || app.name}`,
    `이름: ${app.name}`,
    `국적: ${app.nationality ?? "-"}`,
    `비자: ${app.has_visa == null ? "-" : app.has_visa ? `있음 (${app.visa_label ?? ""})` : "없음/신청예정"}`,
    `실력: ${app.skill_level ? SKILL_LABEL[app.skill_level] : "-"}`,
    `한국어: ${app.korean_level ? KOREAN_LABEL[app.korean_level] : "-"}`,
    `이메일: ${app.email}`,
    `메신저: ${app.contacts.map((c) => `${c.type}:${c.handle}`).join(", ") || "-"}`,
    `현재 위치: ${app.currently_in_korea == null ? "-" : app.currently_in_korea ? "한국" : "자국"}`,
    `한국 거주지: ${app.has_residence_in_korea ? `있음${app.residence_region ? ` (${app.residence_region})` : ""}` : "없음"}`,
    `입국 가능일: ${app.available_entry_date ?? "-"}`,
    `영상: ${app.dance_video_url ?? "-"}`,
    `프로필: ${app.profile_url ?? "-"}`,
    `신청 ID: ${app.id}`,
    "",
    "처리: https://deetz.kr/admin/visa",
  ].join("\n");

  return await sendGmailEmail({
    to: RECIPIENT,
    subject,
    text,
    html,
    replyTo: app.email || undefined,
  });
}

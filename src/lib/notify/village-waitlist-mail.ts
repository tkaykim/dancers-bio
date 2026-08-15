import "server-only";
import { sendGmailEmail } from "@/lib/gmail";

// deetz Village 수요조사 접수 알림 → 운영자. /village 제출 시 비치명적으로 호출.
const RECIPIENT = process.env.VILLAGE_WAITLIST_TO || process.env.VISA_APPLICATION_TO || "dancers.bio.kr@gmail.com";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const OPTION_LABEL: Record<string, string> = {
  a: "옵션 A (강서구 2층 · 첫달 200만 / 월 50만)",
  b: "옵션 B (강서구 4층 엘리베이터 · 첫달 240만 / 월 60만)",
  either: "둘 다 괜찮음",
  undecided: "미정",
};

const ROOM_LABEL: Record<string, string> = {
  single: "1인실",
  double: "2인실",
  quad: "4인실",
  six: "6인실",
  any: "상관없음",
};

const DECLINE_LABEL: Record<string, string> = {
  price: "비용이 비쌈",
  roommate: "함께 사는 게 부담",
  already_housed: "이미 거처 있음",
  facility: "시설이 아쉬움",
  location: "위치가 안 맞음",
  timing: "시기가 안 맞음",
  other: "기타",
};

const LANG_LABEL: Record<string, string> = { en: "English", ja: "日本語", ko: "한국어" };

export interface VillageWaitlistEmail {
  id: string;
  interested: boolean;
  name: string | null;
  nationality: string | null;
  contactType: string | null;
  contact: string | null;
  preferredOption: string | null;
  roomPreference: string | null;
  moveInMonth: string | null;
  message: string | null;
  declineReasons: string[];
  declineReasonDetail: string | null;
  lang: string;
  createdAt: string;
}

export async function sendVillageWaitlistEmail(
  entry: VillageWaitlistEmail,
): Promise<{ ok: boolean; error?: string }> {
  const ts = new Date(entry.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const who = entry.name?.trim() || "이름 미기재";
  const subject = entry.interested
    ? `[deetz Village 대기등록] ${who} (${entry.nationality ?? "국적 미상"})`
    : `[deetz Village 미진행 사유] ${who}`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#666;width:130px;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 12px;font-size:13px;word-break:break-all;">${value}</td></tr>`;

  const rows: string[] = [
    row("구분", entry.interested ? "<b>진행 희망 (대기등록)</b>" : "진행 안 함 (사유 설문)"),
    row("이름", escapeHtml(entry.name ?? "-")),
    row("국적", escapeHtml(entry.nationality ?? "-")),
    row(
      "연락처",
      entry.contact
        ? `${escapeHtml(entry.contactType ?? "")} · ${escapeHtml(entry.contact)}`
        : "-",
    ),
  ];

  if (entry.interested) {
    rows.push(
      row("희망 옵션", escapeHtml(OPTION_LABEL[entry.preferredOption ?? ""] ?? "-")),
      row("희망 방", escapeHtml(ROOM_LABEL[entry.roomPreference ?? ""] ?? "-")),
      row("희망 입주", escapeHtml(entry.moveInMonth ?? "-")),
    );
  } else {
    rows.push(
      row(
        "사유",
        entry.declineReasons.length > 0
          ? escapeHtml(entry.declineReasons.map((r) => DECLINE_LABEL[r] ?? r).join(", "))
          : "-",
      ),
      row("사유 상세", escapeHtml(entry.declineReasonDetail ?? "-")),
    );
  }

  rows.push(
    row("메모", escapeHtml(entry.message ?? "-")),
    row("사용 언어", escapeHtml(LANG_LABEL[entry.lang] ?? entry.lang)),
    row("접수 시각", escapeHtml(ts)),
  );

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:12px;color:#888;margin:0 0 4px;">deetz Village · 수요조사</p>
  <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(subject.replace(/^\[[^\]]+\]\s*/, ""))}</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;font-size:13px;">${rows.join("")}</table>
  <p style="margin:18px 0 0;font-size:12px;color:#888;">관리자 화면: /admin/village</p>
</div>`;

  const text = [
    subject,
    `구분: ${entry.interested ? "진행 희망 (대기등록)" : "진행 안 함 (사유 설문)"}`,
    `이름: ${entry.name ?? "-"}`,
    `국적: ${entry.nationality ?? "-"}`,
    `연락처: ${entry.contact ? `${entry.contactType ?? ""} ${entry.contact}` : "-"}`,
    entry.interested
      ? `희망 옵션: ${OPTION_LABEL[entry.preferredOption ?? ""] ?? "-"}`
      : `사유: ${entry.declineReasons.map((r) => DECLINE_LABEL[r] ?? r).join(", ") || "-"}`,
    entry.interested
      ? `희망 방: ${ROOM_LABEL[entry.roomPreference ?? ""] ?? "-"}`
      : `사유 상세: ${entry.declineReasonDetail ?? "-"}`,
    entry.interested ? `희망 입주: ${entry.moveInMonth ?? "-"}` : "",
    `메모: ${entry.message ?? "-"}`,
    `접수 시각: ${ts}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendGmailEmail({ to: RECIPIENT, subject, text, html });
}

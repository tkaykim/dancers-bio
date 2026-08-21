#!/usr/bin/env node
/**
 * 영상 제출자 목록을 CSV 로 내보낸다. 검수 리스트 시트에 붙일 원본이다.
 *
 * ⚠ 컬럼은 담당자가 시트에서 재구성한 레이아웃을 따른다(2026-08-20 기준).
 *   A(빈칸) / B No / C 이름 / D 인플루언서 ID / E 인스타그램 URL /
 *   F 검수 완료 / G 검수 결과 / H 업로드 일자 / I 업로드 URL / J 비고
 * 이 스크립트는 담당자가 채우는 F~I 는 손대지 않고, C~E 와 J(공동작업자 메모)만 낸다.
 * 시트 반영은 orchestrator-integrations/tmp/sync-review-sheet.ts 가 한다.
 *
 *   node scripts/export-submitters-csv.mjs [출력경로]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 무시 */
  }
}

const PROJECT_ID = "06232945-3563-431e-b399-edc6c7b21dc5";
const OUT = process.argv[2] || "C:/Users/tkay/Desktop/deliverables/challenge-submitters.csv";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await db
  .from("project_submissions")
  .select("instagram_handle, display_name, uploaded_at, collaborator_handles, application_id")
  .eq("project_id", PROJECT_ID)
  .not("uploaded_at", "is", null)
  .order("uploaded_at", { ascending: true });

if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

// 확정 안내(가이드라인 메일)와 업로드 일자 확정 공지를 실제로 받았는지 본다.
// 시트에 '전달 여부'로 표시할 값이라 추측하지 않고 발송 로그를 그대로 읽는다.
const { data: apps } = await db
  .from("applications")
  .select("id, applicant_id")
  .eq("project_id", PROJECT_ID);
const applicantByApp = new Map((apps ?? []).map((a) => [a.id, a.applicant_id]));

const { data: logs } = await db
  .from("project_notification_log")
  .select("recipient_id, channel")
  .eq("project_id", PROJECT_ID)
  .in("channel", ["challenge_guideline_mail", "challenge_upload_notice"]);
const gotGuideline = new Set((logs ?? []).filter((l) => l.channel === "challenge_guideline_mail").map((l) => l.recipient_id));
const gotNotice = new Set((logs ?? []).filter((l) => l.channel === "challenge_upload_notice").map((l) => l.recipient_id));

/**
 * 둘 다 받았으면 O, 둘 다 못 받았으면 X.
 * 하나만 받은 경우는 O/X 로 뭉개면 판단을 그르치므로 무엇이 빠졌는지 그대로 남긴다.
 */
function delivered(applicationId) {
  const pid = applicantByApp.get(applicationId);
  if (!pid) return "확인불가";
  const g = gotGuideline.has(pid);
  const n = gotNotice.has(pid);
  if (g && n) return "O";
  if (g) return "△ 가이드라인만";
  if (n) return "△ 업로드공지만";
  return "X";
}

/** 쉼표·따옴표·줄바꿈이 있으면 감싼다. */
function cell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = [["이름", "인플루언서 ID", "인스타그램 URL", "비고", "확정안내 및 업로드 가이드 전달 여부"]];
for (const r of data ?? []) {
  const collab = (r.collaborator_handles ?? []).filter(Boolean);
  rows.push([
    cell((r.display_name ?? "").trim() || r.instagram_handle),
    cell(r.instagram_handle),
    cell(`https://www.instagram.com/${r.instagram_handle}`),
    // 공동작업자는 참여자가 적어둔 메모다. 정산 기준은 사람이 나중에 판단한다.
    cell(collab.length ? `공동작업자: ${collab.map((h) => "@" + h).join(", ")}` : ""),
    delivered(r.application_id),
  ]);
}

// 엑셀·시트에서 한글이 깨지지 않게 BOM 을 붙인다.
writeFileSync(OUT, "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n") + "\r\n", "utf8");
console.log(`제출자 ${rows.length - 1}명 → ${OUT}`);

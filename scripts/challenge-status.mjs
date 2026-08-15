#!/usr/bin/env node
/**
 * 릴스 챌린지 진행 현황 — 발송 / 열람 / 제출을 한 표로 본다.
 *
 * 조회 전용이다. 아무것도 쓰지 않는다.
 *
 *   node scripts/challenge-status.mjs
 *
 * 열람은 근사치다(추적 픽셀 한계):
 *  - 수신자가 이미지를 차단하면 열어도 안 잡힌다.
 *  - Gmail 이미지 프록시가 프리페치하면 실제로 안 봤는데 찍힐 수 있다.
 * 진짜 신호는 제출 여부다.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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
const CHANNEL = "challenge_guideline_mail";
const CAMPAIGN = "challenge-guideline-2026-08";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: subs } = await db
  .from("project_submissions")
  .select("application_id, dancer_id, instagram_handle, display_name, uploaded_at, drive_file_name, drive_web_link")
  .eq("project_id", PROJECT_ID);

if (!subs?.length) {
  console.log("아직 확정자가 없습니다.");
  process.exit(0);
}

const { data: dancers } = await db
  .from("dancers")
  .select("id, profile_id")
  .in("id", subs.map((s) => s.dancer_id).filter(Boolean));
const profileByDancer = new Map((dancers ?? []).map((d) => [d.id, d.profile_id]));

const { data: logs } = await db
  .from("project_notification_log")
  .select("recipient_id, created_at")
  .eq("project_id", PROJECT_ID)
  .eq("channel", CHANNEL);
const sentAt = new Map((logs ?? []).map((l) => [l.recipient_id, l.created_at]));

// 이메일 → 열람 시각
const emailByProfile = new Map();
for (const pid of new Set([...profileByDancer.values()].filter(Boolean))) {
  const { data } = await db.auth.admin.getUserById(pid);
  if (data?.user?.email) emailByProfile.set(pid, data.user.email.toLowerCase());
}

const { data: opens } = await db
  .from("email_opens")
  .select("recipient_email, opened_at")
  .eq("campaign", CAMPAIGN);
const openMap = new Map();
for (const o of opens ?? []) {
  const k = String(o.recipient_email).toLowerCase();
  const prev = openMap.get(k);
  openMap.set(k, {
    count: (prev?.count ?? 0) + 1,
    first: prev?.first && prev.first < o.opened_at ? prev.first : o.opened_at,
  });
}

const kst = (v) =>
  v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-";

const rows = subs
  .map((s) => {
    const pid = profileByDancer.get(s.dancer_id);
    const email = pid ? emailByProfile.get(pid) : null;
    const open = email ? openMap.get(email) : null;
    return {
      이름: s.display_name ?? "-",
      핸들: s.instagram_handle,
      발송: kst(pid ? sentAt.get(pid) : null),
      열람: open ? `${kst(open.first)} (${open.count}회)` : "-",
      제출: s.uploaded_at ? kst(s.uploaded_at) : "-",
      파일: s.drive_file_name ?? "-",
    };
  })
  .sort((a, b) => String(a.발송).localeCompare(String(b.발송)));

console.table(rows);

const sent = rows.filter((r) => r.발송 !== "-").length;
const opened = rows.filter((r) => r.열람 !== "-").length;
const uploaded = rows.filter((r) => r.제출 !== "-").length;
console.log(`\n확정 ${rows.length}명 · 발송 ${sent} · 열람 ${opened} · 제출 ${uploaded}`);
console.log("열람은 추적 픽셀 기반 근사치입니다. 이미지 차단 시 잡히지 않습니다.");

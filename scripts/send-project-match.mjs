// 공고 매칭 알림 수동 발송.
//
// createProjectAction은 "바로 게시"로 만든 공고에만 매칭 알림을 보낸다. draft로 등록한 뒤
// 나중에 open으로 바꾼 공고는 알림이 나가지 않으므로, 그럴 때 이 스크립트로 보낸다.
// src/lib/notify/project-match.ts 와 동일한 절차(RPC → 멱등 로그 → 인앱+웹푸시)를 따른다.
//
//   node scripts/send-project-match.mjs <short_code...>          # 대상만 출력
//   node scripts/send-project-match.mjs <short_code...> --send   # 실제 발송

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const send = args.includes("--send");
const codes = args.filter((a) => !a.startsWith("--"));
if (codes.length === 0) throw new Error("short_code를 하나 이상 지정하세요.");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
// VAPID 키는 프로덕션 환경에만 있다. 로컬에서 돌릴 땐 인앱 알림만 보내고 웹푸시는 건너뛴다.
const canPush = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (canPush) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@deetz.kr",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.log("VAPID 키 없음 — 인앱 알림만 보내고 웹푸시는 건너뜁니다.");
}

for (const code of codes) {
  const { data: project } = await admin
    .from("projects")
    .select("id, title, short_code, status, visibility, deleted_at")
    .eq("short_code", code)
    .maybeSingle();

  if (!project || project.deleted_at) {
    console.log(`${code}: 공고 없음 — 건너뜀`);
    continue;
  }
  if (project.status !== "open" || project.visibility !== "public") {
    console.log(`${code}: ${project.status}/${project.visibility} — 공개·모집중이 아니라 건너뜀`);
    continue;
  }

  const { data: rows, error } = await admin.rpc("dancers_to_notify_for_project", { p_id: project.id });
  if (error) {
    console.log(`${code}: RPC 실패 — ${error.message}`);
    continue;
  }
  const recipients = [...new Set((rows ?? []).map((r) => r.profile_id).filter(Boolean))];
  if (recipients.length === 0) {
    console.log(`${code}: 대상 0명 — 건너뜀`);
    continue;
  }

  if (!send) {
    console.log(`${code}: 대상 ${recipients.length}명 (dry-run, 발송 안 함) — ${project.title}`);
    continue;
  }

  // 멱등: 이미 보낸 수신자는 ON CONFLICT DO NOTHING으로 걸러진다.
  const { data: inserted, error: logErr } = await admin
    .from("project_notification_log")
    .upsert(
      recipients.map((rid) => ({ project_id: project.id, recipient_id: rid, channel: "match" })),
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
    )
    .select("recipient_id");
  if (logErr) {
    console.log(`${code}: 로그 실패 — ${logErr.message}`);
    continue;
  }

  const fresh = (inserted ?? []).map((r) => r.recipient_id);
  if (fresh.length === 0) {
    console.log(`${code}: 이미 전원 발송됨 — 건너뜀`);
    continue;
  }

  const { error: nErr } = await admin.from("notifications").insert(
    fresh.map((rid) => ({
      recipient_id: rid,
      type: "project_posted_match",
      payload: { project_id: project.id, short_code: project.short_code, project_title: project.title },
    })),
  );
  if (nErr) console.log(`${code}: 인앱 알림 실패 — ${nErr.message}`);

  const { data: subs } = canPush
    ? await admin
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in("user_id", fresh)
    : { data: [] };

  let pushed = 0;
  const expired = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: "핏 맞는 새 공고가 올라왔어요",
            body: project.title,
            url: `/projects/${project.short_code}`,
            tag: `project-${project.short_code}`,
          }),
          { TTL: 60 * 60 * 24 },
        );
        pushed += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) expired.push(s.endpoint);
        else console.log(`  push 실패 ${err?.statusCode ?? ""}`);
      }
    }),
  );
  if (expired.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", expired);

  console.log(
    `${code}: 인앱 ${fresh.length}명 + 웹푸시 ${pushed}건 발송 (만료구독 ${expired.length} 정리) — ${project.title}`,
  );
}

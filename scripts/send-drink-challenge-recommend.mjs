// 음료 브랜드 댄스챌린지 공고 추천 메일.
//
// 대상 = 활성 댄서 + 계정 이메일 있음 + 기지원 제외 + 수신거부 제외.
// 멱등 = project_notification_log(channel='email_recommend')에 이미 있는 수신자는 제외.
//
//   node scripts/send-drink-challenge-recommend.mjs --dump
//   node scripts/send-drink-challenge-recommend.mjs --test you@example.com
//   node scripts/send-drink-challenge-recommend.mjs --send --confirm-send=DEETZ_DRINK_CHALLENGE

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const envPath = existsSync(new URL("../.env.local", import.meta.url))
  ? new URL("../.env.local", import.meta.url)
  : "C:/Users/tkay/Desktop/dev/dancers-bio/.env.local";
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const send = args.includes("--send");
const dump = args.includes("--dump");
const confirmSend = args.includes("--confirm-send=DEETZ_DRINK_CHALLENGE");
const testIdx = args.indexOf("--test");
const testEmail = testIdx >= 0 ? args[testIdx + 1] : null;
const testNameIdx = args.indexOf("--test-name");
const testName = testNameIdx >= 0 ? args[testNameIdx + 1] : "테스트";
const testTokenIdx = args.indexOf("--test-token");
const testToken = testTokenIdx >= 0 ? args[testTokenIdx + 1] : "00000000-0000-0000-0000-000000000000";

const PROJECT_CODE = "qhb5xc";
const PROJECT_ID = "443e791a-327e-4556-b632-b8f87e9d5559";
const FROM_NAME = "deetz 에이전시 & 매거진";
const BASE = "https://www.deetz.kr";
const THROTTLE_MS = 1300;
const CHANNEL = "email_recommend";

if (send && !confirmSend) {
  throw new Error("--send requires --confirm-send=DEETZ_DRINK_CHALLENGE");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maskEmail(email) {
  return email.replace(/^(.).*(@.*)$/, "$1***$2");
}

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD 누락");
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1,
    maxMessages: 500,
    rateDelta: 1300,
    rateLimit: 1,
    auth: { user, pass },
  });
}

async function sendOne(t, to, mail) {
  await t.sendMail({
    from: `"${FROM_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

function buildMail({ name, project, token }) {
  const safeName = esc(name || "댄서");
  const cta = `${BASE}/projects/${project.short_code}`;
  const unsub = token ? `${BASE}/unsubscribe/${token}` : `${BASE}/me/notifications`;
  const subject = "[deetz] 음료 브랜드 댄스챌린지 참여 댄서 모집 안내";

  const text = [
    `안녕하세요 ${name || "댄서"}님,`,
    "",
    "deetz에 공개 모집 중인 음료 브랜드 댄스챌린지 공고를 안내드립니다.",
    "브랜드명과 제품명은 진행 확정 전까지 대외비로 운영됩니다.",
    "",
    `[${project.title}]`,
    "내용: 댄스챌린지 영상 참여 및 SNS 릴스 업로드",
    "업로드: 2026년 8월 3주차 예정",
    "장소: 온라인/SNS 진행",
    "페이: 지원 시 희망 단가 직접 제출",
    "지원 마감: 2026년 8월 10일",
    "",
    "이번 건은 클라이언트 쪽 단가 파악이 중요한 공고입니다.",
    "정확한 금액이 아니어도 괜찮으니 가능한 범위의 러프한 단가를 꼭 입력해 주세요.",
    "세부 조건 조정이 필요하면 단가 입력 후 협의 가능을 함께 체크하실 수 있습니다.",
    "",
    `공고 보고 지원하기: ${cta}`,
    "",
    "이 메일이 불필요하시면 아래 링크에서 수신거부하실 수 있습니다.",
    `수신거부: ${unsub}`,
    "",
    "deetz · 댄서 매거진 & 캐스팅 플랫폼",
    "deetz.kr · dancers.bio.kr@gmail.com",
  ].join("\n");

  const html = `<!doctype html>
<html lang="ko">
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div>
  <div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
</td></tr>
<tr><td style="padding:30px 32px 8px;color:#111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">새 공고 안내</span>
  <p style="font-size:20px;font-weight:800;margin:18px 0 14px;line-height:1.45;color:#111;">음료 브랜드 댄스챌린지 참여 댄서를 모집합니다</p>
  <div style="font-size:15px;line-height:1.8;color:#33363b;">
    안녕하세요 ${safeName}님.<br>
    deetz에 공개 모집 중인 음료 브랜드 댄스챌린지 공고를 안내드립니다.<br>
    브랜드명과 제품명은 진행 확정 전까지 대외비로 운영됩니다.
  </div>
</td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <p style="font-size:15px;font-weight:700;color:#111;margin:0 0 12px;line-height:1.5;">${esc(project.title)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
      <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">내용</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">댄스챌린지 영상 참여 및 SNS 릴스 업로드</td></tr>
      <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">업로드</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">2026년 8월 3주차 예정</td></tr>
      <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">장소</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">온라인/SNS 진행</td></tr>
      <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">페이</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">지원 시 희망 단가 직접 제출</td></tr>
      <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">마감</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">2026년 8월 10일</td></tr>
    </tbody></table>
  </div>
</td></tr>
<tr><td style="padding:16px 32px 4px;">
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:15px 17px;font-size:14px;line-height:1.75;color:#7c2d12;">
    이번 건은 클라이언트 쪽 단가 파악이 중요한 공고입니다.<br>
    정확한 금액이 아니어도 괜찮으니 가능한 범위의 러프한 단가를 꼭 입력해 주세요.<br>
    세부 조건 조정이 필요하면 단가 입력 후 협의 가능을 함께 체크하실 수 있습니다.
  </div>
</td></tr>
<tr><td style="padding:18px 32px 28px;">
  <a href="${cta}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">공고 보고 지원하기 →</a>
</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
  <div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin:10px 0 14px;">
    <a href="https://www.instagram.com/deetz.kr/" style="color:#44474d;text-decoration:none;">Instagram @deetz.kr</a> &nbsp;·&nbsp;
    <a href="https://www.youtube.com/@deetzmagazine" style="color:#44474d;text-decoration:none;">YouTube @deetzmagazine</a>
  </div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:dancers.bio.kr@gmail.com" style="color:#44474d;text-decoration:none;">dancers.bio.kr@gmail.com</a>
  </div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.7;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 가입하신 주소로 발송되었습니다.<br><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">추천·소식 메일 수신거부</a></div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  return { subject, text, html };
}

async function loadProject() {
  const { data: project, error } = await admin
    .from("projects")
    .select("id, title, short_code, status, visibility, deleted_at")
    .eq("id", PROJECT_ID)
    .maybeSingle();
  if (error) throw new Error(`공고 조회 실패: ${error.message}`);
  if (!project || project.deleted_at) throw new Error(`공고 없음: ${PROJECT_CODE}`);
  if (project.status !== "open" || project.visibility !== "public") {
    throw new Error(`공고가 공개·모집중이 아님: ${project.status}/${project.visibility}`);
  }
  return project;
}

async function selectInChunks({ table, select, column, values, chunkSize = 100 }) {
  const rows = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadRecipients(projectId) {
  const { data: dancers, error: dancerError } = await admin
    .from("dancers")
    .select("id, created_at, profile_id")
    .not("profile_id", "is", null)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (dancerError) throw new Error(`댄서 조회 실패: ${dancerError.message}`);

  const byProfile = new Map();
  for (const dancer of dancers ?? []) {
    const profileId = dancer.profile_id;
    if (!profileId || byProfile.has(profileId)) continue;
    byProfile.set(profileId, {
      profile_id: profileId,
      dancer_id: dancer.id,
      name: "댄서",
    });
  }

  const profileIds = Array.from(byProfile.keys());
  if (profileIds.length === 0) return [];

  const [profiles, prefs, { data: applications, error: appError }, { data: logs, error: logError }] = await Promise.all([
    selectInChunks({
      table: "profiles",
      select: "id, display_name",
      column: "id",
      values: profileIds,
    }),
    selectInChunks({
      table: "notification_preferences",
      select: "user_id, email_project_match, email_unsubscribed_all, unsubscribe_token",
      column: "user_id",
      values: profileIds,
    }),
    admin
      .from("applications")
      .select("dancer_id")
      .eq("project_id", projectId)
      .is("archived_at", null),
    admin
      .from("project_notification_log")
      .select("recipient_id")
      .eq("project_id", projectId)
      .eq("channel", CHANNEL),
  ]);
  if (appError) throw new Error(`지원자 조회 실패: ${appError.message}`);
  if (logError) throw new Error(`발송 로그 조회 실패: ${logError.message}`);

  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  for (const recipient of byProfile.values()) {
    recipient.name = profileNameById.get(recipient.profile_id) ?? "댄서";
  }

  const authRows = await mapWithConcurrency(profileIds, 10, async (profileId) => {
    const { data, error } = await admin.auth.admin.getUserById(profileId);
    return {
      profile_id: profileId,
      email: data?.user?.email ?? null,
      error: error?.message ?? null,
    };
  });
  const authErrors = authRows.filter((row) => row.error);
  if (authErrors.length > 0) {
    console.warn(`Auth 이메일 조회 스킵: ${authErrors.length}명`);
  }
  const emailByUser = new Map(
    authRows
      .filter((row) => row.email)
      .map((row) => [row.profile_id, row.email]),
  );

  const prefByUser = new Map((prefs ?? []).map((pref) => [pref.user_id, pref]));
  const appliedDancerIds = new Set((applications ?? []).map((app) => app.dancer_id));
  const alreadySent = new Set((logs ?? []).map((log) => log.recipient_id));

  return Array.from(byProfile.values())
    .map((recipient) => {
      const pref = prefByUser.get(recipient.profile_id);
      return {
        ...recipient,
        email: emailByUser.get(recipient.profile_id) ?? null,
        unsubscribe_token: pref?.unsubscribe_token ?? null,
        email_project_match: pref?.email_project_match ?? true,
        email_unsubscribed_all: pref?.email_unsubscribed_all ?? false,
        already_sent: alreadySent.has(recipient.profile_id),
        already_applied: appliedDancerIds.has(recipient.dancer_id),
      };
    })
    .filter((recipient) =>
      recipient.email &&
      !recipient.email_unsubscribed_all &&
      recipient.email_project_match !== false &&
      !recipient.already_sent &&
      !recipient.already_applied
    );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const project = await loadProject();
console.log(`공고: ${project.title} (${project.short_code})`);

if (testEmail) {
  const mail = buildMail({
    name: testName,
    project,
    token: testToken,
  });
  const t = transporter();
  await sendOne(t, testEmail, mail);
  console.log(`테스트 발송 완료: ${testEmail}`);
  process.exit(0);
}

const recipients = await loadRecipients(project.id);
console.log(`대상: ${recipients.length}명 (활성 댄서 · 기지원 제외 · 수신거부 제외 · 미발송)`);

if (dump) {
  const outDir = new URL("./out/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const mail = buildMail({
    name: recipients[0]?.name ?? "샘플",
    project,
    token: recipients[0]?.unsubscribe_token ?? "preview-token",
  });
  const out = new URL(`./out/drink-challenge-${PROJECT_CODE}-preview.html`, import.meta.url);
  writeFileSync(out, mail.html, "utf8");
  console.log(`미리보기 저장: ${out.pathname}`);
}

if (!send) {
  console.log("dry-run입니다.");
  console.log("샘플 5명:");
  for (const recipient of recipients.slice(0, 5)) {
    console.log(`  · ${recipient.name} <${maskEmail(recipient.email)}>`);
  }
  console.log("실제 발송은 --send --confirm-send=DEETZ_DRINK_CHALLENGE 필요.");
  process.exit(0);
}

const profileIds = recipients.map((recipient) => recipient.profile_id);
await admin
  .from("notification_preferences")
  .upsert(profileIds.map((id) => ({ user_id: id })), {
    onConflict: "user_id",
    ignoreDuplicates: true,
  });

const prefRows = await selectInChunks({
  table: "notification_preferences",
  select: "user_id, unsubscribe_token, email_unsubscribed_all",
  column: "user_id",
  values: profileIds,
});
const tokenByUser = new Map((prefRows ?? []).map((pref) => [pref.user_id, pref]));

const t = transporter();
let sent = 0;
const failed = [];
for (const recipient of recipients) {
  const pref = tokenByUser.get(recipient.profile_id);
  if (pref?.email_unsubscribed_all) continue;
  const mail = buildMail({
    name: recipient.name,
    project,
    token: pref?.unsubscribe_token ?? "",
  });
  try {
    await sendOne(t, recipient.email, mail);
    await admin
      .from("project_notification_log")
      .upsert(
        { project_id: project.id, recipient_id: recipient.profile_id, channel: CHANNEL },
        { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
      );
    sent += 1;
    if (sent % 20 === 0) console.log(`  ... ${sent}/${recipients.length}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    failed.push({
      email: maskEmail(recipient.email),
      error: message.slice(0, 140),
    });
    if (/Invalid login|Too many login attempts|4\.7\.0|Daily user sending limit exceeded|5\.4\.5/i.test(message)) {
      console.log("Gmail SMTP 제한/인증 오류로 발송을 중단합니다.");
      break;
    }
  }
  await sleep(THROTTLE_MS);
}

console.log(`완료: 발송 ${sent}건 / 실패 ${failed.length}건`);
if (failed.length) console.log(JSON.stringify(failed.slice(0, 10), null, 2));
t.close();

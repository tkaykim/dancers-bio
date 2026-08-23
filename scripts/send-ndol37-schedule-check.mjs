import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  fetchUnsubscribePrefs,
  listUnsubscribeHeaders,
} from "./lib/list-unsubscribe.mjs";
import {
  assertKoreanMailSafe,
  escapeHtml,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

const SITE = "https://deetz.kr";
const PROJECT_CODE = "ndol37";
const SEND_FLAG = "--send";
const ACCEPT_FLAG = "--accept";

function loadEnv(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return;
  for (const line of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function sign(payload, key) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

function makeProjectSurveyToken(projectId, dancerId) {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const payload = `ps:${projectId}:${dancerId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email || "") && !/\.con$/i.test(email || "");
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "(no email)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

async function getUserEmail(admin, userId) {
  if (!userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

function buildMail({ name, url }) {
  const subject = "[deetz] 6/18 오디션 일정 가능 여부 확인 요청";
  const displayName = name || "지원자";
  const text = [
    `안녕하세요, ${displayName}님. deetz입니다.`,
    "",
    "지원해주신 남자아이돌 댄서 모집_서울문화예술대 프로젝트 관련해,",
    "6/18(목) 16:00-21:00 1차 오디션 참석 가능 여부를 먼저 확인드립니다.",
    "",
    "아래 링크에서 일정 가능 여부를 제출해주세요.",
    url,
    "",
    "[주요 일정]",
    "· 1차 오디션: 6/18(목) 16:00-21:00",
    "· 2차 연습: 6/30(화) 예정",
    "· 촬영: 7/13(월)-7/14(화)",
    "",
    "해당 시간 전체 참석이 어렵더라도 조정 가능성이 있으면 메모에 남겨주세요.",
    "이번 메일은 일정 확인 요청이며, 현장 세부 안내는 참석 가능 여부 확인 후 별도로 안내드릴 수 있습니다.",
    "",
    "감사합니다.",
  ].join("\n");
  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, ${escapeHtml(displayName)}님. deetz입니다.</p>
<p style="margin:0 0 14px;">지원해주신 <b>남자아이돌 댄서 모집_서울문화예술대</b> 프로젝트 관련해,<br><b>6/18(목) 16:00-21:00 1차 오디션 참석 가능 여부</b>를 먼저 확인드립니다.</p>
<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:800;margin:0 0 10px;color:#111;">주요 일정</p>
  <ul style="margin:0;padding-left:18px;">
    <li style="margin:0 0 6px;">1차 오디션: 6/18(목) 16:00-21:00</li>
    <li style="margin:0 0 6px;">2차 연습: 6/30(화) 예정</li>
    <li style="margin:0;">촬영: 7/13(월)-7/14(화)</li>
  </ul>
</div>
<p style="margin:0 0 14px;">아래 링크에서 일정 가능 여부를 제출해주세요. 해당 시간 전체 참석이 어렵더라도 조정 가능성이 있으면 메모에 남겨주세요.</p>
<p style="margin:0;color:#555;">이번 메일은 일정 확인 요청이며, 현장 세부 안내는 참석 가능 여부 확인 후 별도로 안내드릴 수 있습니다.</p>`;

  const html = renderDeetzMail({
    eyebrow: "일정 확인 요청",
    title: "6/18 오디션 일정 가능 여부 확인",
    bodyHtml,
    ctaText: "일정 가능 여부 제출하기",
    url,
  });

  assertKoreanMailSafe({ subject, text, html });
  return { subject, text, html };
}

async function main() {
  loadEnv(".env.local");
  const send = process.argv.includes(SEND_FLAG);
  const accept = process.argv.includes(ACCEPT_FLAG);
  const admin = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id,title,short_code")
    .eq("short_code", PROJECT_CODE)
    .single();
  if (projectError) throw projectError;

  const { data: apps, error: appError } = await admin
    .from("applications")
    .select("id,status,dancer_id,applicant_id,archived_at,created_at")
    .eq("project_id", project.id)
    .eq("status", "pending")
    .is("archived_at", null)
    .not("dancer_id", "is", null)
    .order("created_at");
  if (appError) throw appError;

  const dancerIds = [...new Set((apps ?? []).map((app) => app.dancer_id).filter(Boolean))];
  const [{ data: dancers, error: dancerError }, { data: privateRows, error: privateError }] =
    await Promise.all([
      admin
        .from("dancers")
        .select("id,stage_name,korean_name,profile_id,social_links")
        .in("id", dancerIds),
      admin.from("dancer_private_info").select("dancer_id,email").in("dancer_id", dancerIds),
    ]);
  if (dancerError) throw dancerError;
  if (privateError) throw privateError;

  const dancerById = new Map((dancers ?? []).map((dancer) => [dancer.id, dancer]));
  const privateByDancer = new Map((privateRows ?? []).map((row) => [row.dancer_id, row]));

  const targets = [];
  for (const app of apps ?? []) {
    const dancer = dancerById.get(app.dancer_id) ?? {};
    const privateInfo = privateByDancer.get(app.dancer_id) ?? {};
    const email =
      (await getUserEmail(admin, app.applicant_id)) ||
      (await getUserEmail(admin, dancer.profile_id)) ||
      privateInfo.email ||
      dancer.social_links?.source_email ||
      null;
    targets.push({
      applicationId: app.id,
      dancerId: app.dancer_id,
      recipientId: app.applicant_id ?? dancer.profile_id ?? null,
      name: dancer.stage_name || dancer.korean_name || "지원자",
      email,
      url: `${SITE}/s/${makeProjectSurveyToken(project.id, app.dancer_id)}`,
    });
  }

  const invalid = targets.filter((target) => !isValidEmail(target.email));
  if (invalid.length > 0) {
    throw new Error(
      `invalid email targets: ${invalid
        .map((target) => `${target.name}(${target.email ?? "no email"})`)
        .join(", ")}`,
    );
  }

  const previews = targets.map((target) => ({
    name: target.name,
    email: maskEmail(target.email),
    url: target.url,
  }));
  console.log(JSON.stringify({ mode: send ? "send" : "dry-run", accept, count: targets.length, previews }, null, 2));

  if (!send) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: requiredEnv("GMAIL_USER"), pass: requiredEnv("GMAIL_APP_PASSWORD") },
  });

  // 지원자 대상 안내성(bulk) 메일 — 수신거부 헤더를 붙인다.
  const prefsByUser = await fetchUnsubscribePrefs(
    admin,
    targets.map((target) => target.recipientId),
  );

  const sent = [];
  for (const target of targets) {
    const mail = buildMail({ name: target.name, url: target.url });
    const info = await transporter.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME || "deetz"}" <${requiredEnv("GMAIL_USER")}>`,
      to: target.email,
      replyTo: "contact@deetz.kr",
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: listUnsubscribeHeaders(
        prefsByUser.get(target.recipientId)?.token ?? null,
      ),
    });
    sent.push({ name: target.name, email: maskEmail(target.email), messageId: info.messageId });
  }

  const accepted = [];
  if (accept) {
    for (const target of targets) {
      const { data, error } = await admin
        .from("applications")
        .update({ status: "accepted" })
        .eq("id", target.applicationId)
        .eq("status", "pending")
        .select("id,status");
      if (error) throw error;
      accepted.push({ name: target.name, updated: data?.length ?? 0 });
    }
  }

  console.log(JSON.stringify({ sent, accepted }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  assertKoreanMailSafe,
  escapeHtml,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

const PROJECT_CODES = ["ndol26", "ndolsm", "ndol02", "ndolbd"];
const SEND_CONFIRM = "SEND_NDOL_UNAVAILABLE_NOTICE";
const AUDITION_START = 16 * 60;
const AUDITION_END = 21 * 60;

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

function hasArg(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function minutes(value) {
  if (!value) return null;
  const [hour, minute = "0"] = String(value).split(":");
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function coversRange(slot, start, end) {
  let slotStart = minutes(slot?.start);
  let slotEnd = minutes(slot?.end);
  if (slotStart === null || slotEnd === null) return false;
  if (slotEnd === 0) slotEnd = 24 * 60;
  return slotStart <= start && end <= slotEnd;
}

function partialCanAuditionWindow(timeSlots) {
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) return "unknown_partial";

  const availableSlots = timeSlots.filter((slot) => slot.kind === "available");
  if (availableSlots.length > 0) {
    return availableSlots.some((slot) => coversRange(slot, AUDITION_START, AUDITION_END))
      ? "can"
      : "cannot";
  }

  const unavailableSlots = timeSlots.filter((slot) => slot.kind === "unavailable");
  if (unavailableSlots.length > 0) {
    const blocksWindow = unavailableSlots.some((slot) => {
      let slotStart = minutes(slot.start);
      let slotEnd = minutes(slot.end);
      if (slotStart === null || slotEnd === null) return false;
      if (slotEnd === 0) slotEnd = 24 * 60;
      return overlaps(slotStart, slotEnd, AUDITION_START, AUDITION_END);
    });
    return blocksWindow ? "cannot" : "can";
  }

  return "unknown_partial";
}

function canAuditionWindow(response) {
  if (!response) return "unknown";
  if (response.status === "available") return "can";
  if (response.status === "unavailable") return "cannot";
  if (response.status === "partial") return partialCanAuditionWindow(response.time_slots);
  return "unknown";
}

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email || "") && !/\.con$/i.test(email || "");
}

function isDoNotContact(dancer) {
  const blob = JSON.stringify({
    stage_name: dancer?.stage_name,
    korean_name: dancer?.korean_name,
    slug: dancer?.slug,
    social_links: dancer?.social_links,
  });
  return (
    dancer?.social_links?.do_not_contact === true ||
    /(\uBC15\s*\uBBFC\s*\uC900|minjun|0nce0ver|onceover)/i.test(blob)
  );
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "(no email)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function buildUnavailableNoticeMail({ name }) {
  const subject = "[deetz] 6/18(목) 오디션 일정 관련 안내";
  const text = [
    `안녕하세요, ${name}님. deetz입니다.`,
    "",
    "먼저 프로젝트에 지원해주시고 일정 가능여부를 제출해주셔서 감사합니다.",
    "",
    "클라이언트 요청에 따라 이번 6/18(목) 연습 및 오디션은 16:00-21:00 전체 시간 참석이 필수 조건으로 확정되었습니다.",
    "제출해주신 일정 기준으로 해당 시간대 전체 참석이 어려운 것으로 확인되어, 아쉽지만 이번 연습에는 참여가 어렵게 되었습니다.",
    "",
    "다만 일정 조정이 가능해 6/18(목) 16:00-21:00 전체 참석이 가능하시다면, 이 메일에 회신으로 알려주세요.",
    "확인 후 가능한 범위에서 다시 안내드리겠습니다.",
    "",
    "추후 충원이 필요하거나 다른 일정으로 함께할 수 있는 기회가 생기면 다시 연락드리겠습니다.",
    "지원해주셔서 진심으로 감사합니다.",
    "",
    "deetz",
  ].join("\n");

  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, ${escapeHtml(name)}님. deetz입니다.</p>
<p style="margin:0 0 14px;">먼저 프로젝트에 지원해주시고 일정 가능여부를 제출해주셔서 감사합니다.</p>
<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;background:#fafafa;">
<p style="margin:0 0 10px;color:#111;"><b>클라이언트 요청에 따라 이번 6/18(목) 연습 및 오디션은 16:00-21:00 전체 시간 참석이 필수 조건으로 확정되었습니다.</b></p>
<p style="margin:0;color:#33363b;">제출해주신 일정 기준으로 해당 시간대 전체 참석이 어려운 것으로 확인되어, 아쉽지만 이번 연습에는 참여가 어렵게 되었습니다.</p>
</div>
<p style="margin:0 0 14px;"><b>다만 일정 조정이 가능해 6/18(목) 16:00-21:00 전체 참석이 가능하시다면, 이 메일에 회신으로 알려주세요.</b><br>확인 후 가능한 범위에서 다시 안내드리겠습니다.</p>
<p style="margin:0 0 14px;">추후 충원이 필요하거나 다른 일정으로 함께할 수 있는 기회가 생기면 다시 연락드리겠습니다.</p>
<p style="margin:0;">지원해주셔서 진심으로 감사합니다.</p>`;

  const html = renderDeetzMail({
    eyebrow: "일정 안내",
    title: "6/18(목) 오디션 일정 관련 안내",
    bodyHtml,
  });

  const mail = { subject, text, html };
  assertKoreanMailSafe(mail);
  return mail;
}

async function getUserEmail(admin, recipientId) {
  if (!recipientId) return null;
  const { data } = await admin.auth.admin.getUserById(recipientId);
  return data?.user?.email ?? null;
}

async function getTargets(admin) {
  const { data: projects, error: projectError } = await admin
    .from("projects")
    .select("id,title,short_code")
    .in("short_code", PROJECT_CODES);
  if (projectError) throw projectError;

  const projectIds = (projects ?? []).map((project) => project.id);
  const codeById = new Map((projects ?? []).map((project) => [project.id, project.short_code]));

  const { data: apps, error: appError } = await admin
    .from("applications")
    .select("project_id,status,dancer_id,applicant_id")
    .in("project_id", projectIds)
    .is("archived_at", null)
    .in("status", ["accepted", "pending"])
    .not("dancer_id", "is", null);
  if (appError) throw appError;

  const dancerIds = [...new Set((apps ?? []).map((app) => app.dancer_id).filter(Boolean))];
  const { data: dancers, error: dancerError } = await admin
    .from("dancers")
    .select("id,stage_name,korean_name,gender,slug,social_links,profile_id")
    .in("id", dancerIds);
  if (dancerError) throw dancerError;
  const dancerById = new Map((dancers ?? []).map((dancer) => [dancer.id, dancer]));

  const { data: schedules, error: scheduleError } = await admin
    .from("project_schedules")
    .select("id,project_id,starts_at")
    .in("project_id", projectIds)
    .eq("collect_availability", true);
  if (scheduleError) throw scheduleError;

  const auditionScheduleIds = new Set(
    (schedules ?? [])
      .filter((schedule) => schedule.starts_at === "2026-06-18T07:00:00+00:00")
      .map((schedule) => schedule.id),
  );
  const projectBySchedule = new Map((schedules ?? []).map((schedule) => [schedule.id, schedule.project_id]));

  const { data: responses, error: responseError } = await admin
    .from("project_schedule_responses")
    .select("schedule_id,dancer_id,status,time_slots")
    .in("schedule_id", [...auditionScheduleIds]);
  if (responseError) throw responseError;

  const auditionResponseByTarget = new Map();
  for (const response of responses ?? []) {
    auditionResponseByTarget.set(
      `${projectBySchedule.get(response.schedule_id)}:${response.dancer_id}`,
      response,
    );
  }

  const rows = [];
  const seen = new Set();
  for (const app of apps ?? []) {
    const dedupeKey = `${app.project_id}:${app.dancer_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const dancer = dancerById.get(app.dancer_id) ?? {};
    if (isDoNotContact(dancer)) continue;

    const auditionWindow = canAuditionWindow(auditionResponseByTarget.get(dedupeKey));
    if (auditionWindow !== "cannot" && auditionWindow !== "unknown_partial") continue;

    const recipientId = app.applicant_id ?? dancer.profile_id ?? null;
    const email = await getUserEmail(admin, recipientId);
    rows.push({
      code: codeById.get(app.project_id),
      status: app.status,
      auditionWindow,
      gender: dancer.gender || "unknown",
      name: dancer.stage_name || dancer.korean_name || "지원자",
      email,
      emailOk: isValidEmail(email),
    });
  }
  return rows;
}

function summarize(rows) {
  const by = (key) => {
    const counts = new Map();
    for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
    return Object.fromEntries([...counts.entries()].sort());
  };
  console.log(`targets: ${rows.length} total, ${rows.filter((row) => row.emailOk).length} email_ok, ${rows.filter((row) => !row.emailOk).length} no_email`);
  console.log(`  project=${JSON.stringify(by("code"))}`);
  console.log(`  status=${JSON.stringify(by("status"))}`);
  console.log(`  gender=${JSON.stringify(by("gender"))}`);
  console.log(`  reason=${JSON.stringify(by("auditionWindow"))}`);
}

async function sendOne(transporter, row, toOverride = null) {
  const mail = buildUnavailableNoticeMail({ name: row.name });
  const to = toOverride ?? row.email;
  await transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "deetz"}" <${requiredEnv("GMAIL_USER")}>`,
    to,
    replyTo: "contact@deetz.kr",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { to, subject: mail.subject };
}

async function main() {
  loadEnv(".env.local");
  const mode = hasArg("--send") ? "send" : hasArg("--test") ? "test" : "dry-run";
  const testTo = argValue("--to") ?? process.env.TEST_EMAIL ?? "tommy0621@naver.com";
  const confirm = argValue("--confirm");

  const admin = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = await getTargets(admin);
  summarize(rows);
  console.log(`mode: ${mode}`);

  if (mode === "dry-run") {
    const sample = rows.find((row) => row.emailOk);
    if (sample) {
      const mail = buildUnavailableNoticeMail({ name: sample.name });
      console.log(`sample_subject: ${mail.subject}`);
      console.log(`sample_to_masked: ${maskEmail(sample.email)}`);
    }
    console.log("No email sent. Use --test first.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: requiredEnv("GMAIL_USER"), pass: requiredEnv("GMAIL_APP_PASSWORD") },
  });

  if (mode === "test") {
    if (!isValidEmail(testTo)) throw new Error("--to must be a valid email");
    const sample = rows.find((row) => row.emailOk);
    if (!sample) throw new Error("No valid target sample");
    const result = await sendOne(transporter, sample, testTo);
    console.log(`test_sent: ${result.subject} -> ${maskEmail(result.to)}`);
    return;
  }

  if (confirm !== SEND_CONFIRM) {
    throw new Error(`Actual send requires --confirm=${SEND_CONFIRM}`);
  }

  const targets = rows.filter((row) => row.emailOk);
  let sent = 0;
  const failures = [];
  for (const row of targets) {
    try {
      const result = await sendOne(transporter, row);
      sent++;
      console.log(`sent ${sent}/${targets.length} to=${maskEmail(result.to)} project=${row.code}`);
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (error) {
      failures.push({ row, error });
      console.error(`failed to=${maskEmail(row.email)} project=${row.code}: ${error.message}`);
    }
  }
  console.log(`done sent=${sent} failed=${failures.length}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

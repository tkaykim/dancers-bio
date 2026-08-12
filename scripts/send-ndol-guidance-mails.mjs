import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  assertKoreanMailSafe,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

const SITE = "https://deetz.kr";
const PROJECT_CODES = ["ndol26", "ndolsm", "ndol02", "ndolbd"];
const SEND_CONFIRM = "SEND_NDOL_GUIDANCE";
const SEND_LOCKED_AFTER_LOCATION_ERROR = true;
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

function argValue(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function hasArg(name) {
  return process.argv.includes(name);
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

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "(no email)";
  const [local, domain] = email.split("@");
  const prefix = local.slice(0, 2);
  return `${prefix}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
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
    return availableSlots.some((slot) => coversRange(slot, AUDITION_START, AUDITION_END)) ? "can" : "cannot";
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

function renderShell({ eyebrow, title, bodyHtml, ctaText, url }) {
  return renderDeetzMail({ eyebrow, title, bodyHtml, ctaText, url });
}

function buildNoticeMail({ name, url }) {
  const subject = "[deetz] 6/18(목) 오디션 현장 안내";
  const text = [
    `안녕하세요, ${name}님. deetz입니다.`,
    "6/18(목) 1차 오디션 현장 운영 방식을 안내드립니다.",
    "",
    "[현장 운영 방식]",
    "1. 15시 50분까지 합정 로이코 건물에 도착해주세요.",
    "   서울 마포구 토정로 112 (https://naver.me/x4FwEQfK)",
    "2. 로비에서 접수해 번호표를 받고, 3층 진행 공간으로 이동합니다.",
    "3. 당일 연습(오디션)은 디렉터의 요청사항에 따라 진행합니다.",
    "   안무 레슨 형태 + 특정 주제를 드리고 움직임을 자유롭게 표현하는 미션이 있을 수 있습니다.",
    "4. 첫 연습(오디션 형태) 중 디렉터 판단에 따라 쉬는 시간에 탈락이 있을 수 있으며, 탈락 인원은 중도 귀가를 안내드립니다.",
    "5. 연습 종료 후 추후 일정 참여여부 및 상세 일정을 안내드릴 예정입니다.",
    "",
    "* 주차는 불가하오니 대중교통을 이용해주세요.",
    "* 추후 2차 연습일정은 6/30(화) 예정입니다.",
    "",
    "6/30 2차 연습 가능여부는 아래 일정 페이지에서 미리 체크해주시면 좋습니다.",
    url,
    "",
    "당일 뵙겠습니다. 감사합니다.",
  ].join("\n");
  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, ${esc(name)}님. deetz입니다.<br>6/18(목) 1차 오디션 현장 운영 방식을 안내드립니다.</p>
<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
<p style="font-weight:800;margin:0 0 10px;color:#111;">현장 운영 방식</p>
<ol style="margin:0;padding-left:18px;">
<li style="margin:0 0 8px;">15시 50분까지 합정 로이코 건물에 도착해주세요.<br><span style="color:#6b7280;">서울 마포구 토정로 112 · <a href="https://naver.me/x4FwEQfK" style="color:#4f46e5;">지도 보기</a></span></li>
<li style="margin:0 0 8px;">로비에서 접수해 번호표를 받고, 3층 진행 공간으로 이동합니다.</li>
<li style="margin:0 0 8px;">당일 연습은 디렉터의 요청사항에 따라 진행합니다. 안무 레슨 형태와 특정 주제 표현 미션이 있을 수 있습니다.</li>
<li style="margin:0 0 8px;">첫 연습 중 디렉터 판단에 따라 쉬는 시간에 탈락이 있을 수 있으며, 탈락 인원은 중도 귀가를 안내드립니다.</li>
<li style="margin:0;">연습 종료 후 추후 일정 참여여부 및 상세 일정을 안내드릴 예정입니다.</li>
</ol>
</div>
<p style="margin:0 0 10px;color:#33363b;">주차는 불가하오니 대중교통을 이용해주세요.<br>추후 2차 연습일정은 6/30(화) 예정입니다.</p>
<p style="margin:0;">6/30 2차 연습 가능여부는 아래 일정 페이지에서 미리 체크해주시면 좋습니다.</p>`;
  return {
    subject,
    text,
    html: renderShell({
      eyebrow: "현장 안내",
      title: "6/18(목) 오디션 현장 안내",
      bodyHtml,
      ctaText: "내 일정 페이지 열기",
      url,
    }),
  };
}

function buildRequestMail({ name, url }) {
  const subject = "[deetz] 6/18(목) 오디션 가능여부 긴급 확인 및 현장 안내";
  const text = [
    `안녕하세요, ${name}님. deetz입니다.`,
    "지원해주신 프로젝트 관련, 6/18(목) 16:00-21:00 참석 가능 여부가 아직 확인되지 않아 현장 안내와 함께 긴급히 요청드립니다.",
    "아래 링크에서 6/18 16:00-21:00 참석 가능 여부를 먼저 체크해주세요.",
    url,
    "",
    "[현장 운영 방식]",
    "1. 15시 50분까지 합정 로이코 건물에 도착해주세요.",
    "   서울 마포구 토정로 112 (https://naver.me/x4FwEQfK)",
    "2. 로비에서 접수해 번호표를 받고, 3층 진행 공간으로 이동합니다.",
    "3. 당일 연습(오디션)은 디렉터의 요청사항에 따라 진행합니다.",
    "   안무 레슨 형태 + 특정 주제를 드리고 움직임을 자유롭게 표현하는 미션이 있을 수 있습니다.",
    "4. 첫 연습(오디션 형태) 중 디렉터 판단에 따라 쉬는 시간에 탈락이 있을 수 있으며, 탈락 인원은 중도 귀가를 안내드립니다.",
    "5. 연습 종료 후 추후 일정 참여여부 및 상세 일정을 안내드릴 예정입니다.",
    "",
    "* 주차는 불가하오니 대중교통을 이용해주세요.",
    "* 추후 2차 연습일정은 6/30(화) 예정입니다.",
    "",
    "[주요 확인 일정]",
    "· 1차 오디션: 6/18(목) 16:00 (합정 로이코, 15:50 도착)",
    "· 2차 연습: 6/30(화) 예정",
    "· 촬영: 7/13(월)-7/14(화)",
    "",
    "원활한 선발 일정 조율을 위해 아래 링크에서 날짜별 가능여부를 꼭 제출해주세요.",
    url,
    "",
    "제출이 늦어지면 선발·일정 안내에 불이익이 있을 수 있으니 가능하면 빨리 부탁드립니다.",
    "감사합니다.",
  ].join("\n");
  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, ${esc(name)}님. deetz입니다.<br>지원해주신 프로젝트 관련, <b>6/18(목) 16:00-21:00 참석 가능 여부</b>가 아직 확인되지 않아 현장 안내와 함께 긴급히 요청드립니다.</p>
<p style="margin:0 0 14px;">아래 링크에서 6/18 16:00-21:00 참석 가능 여부를 먼저 체크해주세요.</p>
<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
<p style="font-weight:800;margin:0 0 10px;color:#111;">현장 운영 방식</p>
<ol style="margin:0;padding-left:18px;">
<li style="margin:0 0 8px;">15시 50분까지 합정 로이코 건물에 도착해주세요.<br><span style="color:#6b7280;">서울 마포구 토정로 112 · <a href="https://naver.me/x4FwEQfK" style="color:#4f46e5;">지도 보기</a></span></li>
<li style="margin:0 0 8px;">로비에서 접수해 번호표를 받고, 3층 진행 공간으로 이동합니다.</li>
<li style="margin:0 0 8px;">당일 연습은 디렉터의 요청사항에 따라 진행합니다. 안무 레슨 형태와 특정 주제 표현 미션이 있을 수 있습니다.</li>
<li style="margin:0 0 8px;">첫 연습 중 디렉터 판단에 따라 쉬는 시간에 탈락이 있을 수 있으며, 탈락 인원은 중도 귀가를 안내드립니다.</li>
<li style="margin:0;">연습 종료 후 추후 일정 참여여부 및 상세 일정을 안내드릴 예정입니다.</li>
</ol>
</div>
<p style="margin:0 0 10px;color:#33363b;">주차는 불가하오니 대중교통을 이용해주세요.<br>추후 2차 연습일정은 6/30(화) 예정입니다.</p>
<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
<p style="font-weight:800;margin:0 0 10px;color:#111;">주요 확인 일정</p>
<ul style="margin:0;padding-left:18px;">
<li style="margin:0 0 6px;">1차 오디션: 6/18(목) 16:00 (합정 로이코, 15:50 도착)</li>
<li style="margin:0 0 6px;">2차 연습: 6/30(화) 예정</li>
<li style="margin:0;">촬영: 7/13(월)-7/14(화)</li>
</ul>
</div>
<p style="margin:0 0 14px;">원활한 선발 일정 조율을 위해 아래 링크에서 날짜별 가능여부를 꼭 제출해주세요.</p>
<p style="margin:0;">제출이 늦어지면 선발·일정 안내에 불이익이 있을 수 있으니 가능하면 빨리 부탁드립니다.</p>`;
  return {
    subject,
    text,
    html: renderShell({
      eyebrow: "일정 확인 요청",
      title: "6/18(목) 오디션 가능여부 긴급 확인 및 현장 안내",
      bodyHtml,
      ctaText: "내 일정 가능여부 제출하기",
      url,
    }),
  };
}

async function getUserEmail(admin, recipientId) {
  if (!recipientId) return null;
  const { data } = await admin.auth.admin.getUserById(recipientId);
  return data?.user?.email ?? null;
}

async function getTargets(admin) {
  const { data: projects, error: projectError } = await admin
    .from("projects")
    .select("id,title,short_code,schedule_survey_code")
    .in("short_code", PROJECT_CODES);
  if (projectError) throw projectError;
  if ((projects ?? []).length !== PROJECT_CODES.length) {
    const found = new Set((projects ?? []).map((p) => p.short_code));
    throw new Error(`Missing projects: ${PROJECT_CODES.filter((code) => !found.has(code)).join(", ")}`);
  }

  const projectIds = projects.map((project) => project.id);
  const codeById = new Map(projects.map((project) => [project.id, project.short_code]));

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

  const scheduleIds = (schedules ?? []).map((schedule) => schedule.id);
  let responses = [];
  if (scheduleIds.length > 0) {
    const { data, error } = await admin
      .from("project_schedule_responses")
      .select("schedule_id,dancer_id,status,time_slots")
      .in("schedule_id", scheduleIds);
    if (error) throw error;
    responses = data ?? [];
  }

  const projectBySchedule = new Map((schedules ?? []).map((schedule) => [schedule.id, schedule.project_id]));
  const responded = new Set();
  const auditionScheduleIds = new Set(
    (schedules ?? [])
      .filter((schedule) => schedule.starts_at === "2026-06-18T07:00:00+00:00")
      .map((schedule) => schedule.id),
  );
  const auditionResponseByTarget = new Map();
  for (const response of responses) {
    responded.add(`${projectBySchedule.get(response.schedule_id)}:${response.dancer_id}`);
    if (auditionScheduleIds.has(response.schedule_id)) {
      auditionResponseByTarget.set(`${projectBySchedule.get(response.schedule_id)}:${response.dancer_id}`, response);
    }
  }

  const rows = [];
  const seen = new Set();
  for (const app of apps ?? []) {
    const dedupeKey = `${app.project_id}:${app.dancer_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const dancer = dancerById.get(app.dancer_id) ?? {};
    const recipientId = app.applicant_id ?? dancer.profile_id ?? null;
    const email = await getUserEmail(admin, recipientId);
    const url = `${SITE}/s/${makeProjectSurveyToken(app.project_id, app.dancer_id)}`;
    rows.push({
      code: codeById.get(app.project_id),
      projectId: app.project_id,
      status: app.status,
      submitted: responded.has(dedupeKey),
      auditionWindow: canAuditionWindow(auditionResponseByTarget.get(dedupeKey)),
      dancerId: app.dancer_id,
      name: dancer.stage_name || dancer.korean_name || "지원자",
      gender: dancer.gender || "unknown",
      email,
      emailOk: isValidEmail(email),
      doNotContact: isDoNotContact(dancer),
      url,
    });
  }

  const excluded = rows.filter((row) => row.doNotContact);
  const eligible = rows.filter((row) => !row.doNotContact);
  return {
    projects,
    excluded,
    aNotice: eligible.filter((row) => row.auditionWindow === "can"),
    bRequest: eligible.filter((row) => row.status === "accepted" && row.auditionWindow === "unknown"),
    cSkippedPendingSubmitted: eligible.filter((row) => row.status === "pending" && row.submitted && row.auditionWindow !== "can"),
    unavailableOrPartialBlocked: eligible.filter((row) => row.auditionWindow === "cannot" || row.auditionWindow === "unknown_partial"),
  };
}

function summarize(label, rows) {
  const byGender = new Map();
  const byProject = new Map();
  const byStatus = new Map();
  for (const row of rows) {
    byGender.set(row.gender, (byGender.get(row.gender) ?? 0) + 1);
    byProject.set(row.code, (byProject.get(row.code) ?? 0) + 1);
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  }
  console.log(
    `${label}: ${rows.length} total, ${rows.filter((row) => row.emailOk).length} email_ok, ${rows.filter((row) => !row.emailOk).length} no_email`,
  );
  console.log(`  gender=${JSON.stringify(Object.fromEntries([...byGender.entries()].sort()))}`);
  console.log(`  project=${JSON.stringify(Object.fromEntries([...byProject.entries()].sort()))}`);
  console.log(`  status=${JSON.stringify(Object.fromEntries([...byStatus.entries()].sort()))}`);
}

function printSummary(groups) {
  const lines = [
    ["A_notice_16_21_confirmed", groups.aNotice],
    ["B_request_accepted_unknown", groups.bRequest],
    ["C_skipped_pending_submitted", groups.cSkippedPendingSubmitted],
    ["skipped_unavailable_or_partial_blocked", groups.unavailableOrPartialBlocked],
    ["excluded_do_not_contact", groups.excluded],
  ];
  for (const [label, rows] of lines) {
    summarize(label, rows);
  }

  const by = new Map();
  for (const row of [...groups.aNotice, ...groups.bRequest, ...groups.cSkippedPendingSubmitted, ...groups.unavailableOrPartialBlocked]) {
    const key = `${row.code}|${row.status}|${row.auditionWindow}|${row.gender}|${row.emailOk ? "email" : "no_email"}`;
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  console.table(
    [...by.entries()]
      .map(([key, count]) => {
        const [project, status, auditionWindow, gender, email] = key.split("|");
        return { project, status, auditionWindow, gender, email, count };
      })
      .sort((a, b) => a.project.localeCompare(b.project) || a.status.localeCompare(b.status) || a.auditionWindow.localeCompare(b.auditionWindow)),
  );
}

async function sendOne(transporter, row, type, toOverride = null) {
  const mail =
    type === "A"
      ? buildNoticeMail({ name: row.name, url: row.url })
      : buildRequestMail({ name: row.name, url: row.url });
  assertKoreanMailSafe(mail);
  const to = toOverride ?? row.email;
  await transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "deetz"}" <${requiredEnv("GMAIL_USER")}>`,
    to,
    replyTo: "contact@deetz.kr",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { subject: mail.subject, to };
}

async function main() {
  loadEnv(".env.local");

  const mode = hasArg("--send") ? "send" : hasArg("--test") ? "test" : "dry-run";
  const group = argValue("--group") ?? "all";
  const limit = Number(argValue("--limit") ?? "0");
  const testTo = argValue("--to") ?? process.env.TEST_EMAIL ?? process.env.GMAIL_USER;
  const confirm = argValue("--confirm");

  const admin = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const groups = await getTargets(admin);
  printSummary(groups);

  const aRows = groups.aNotice.filter((row) => row.emailOk);
  const bRows = groups.bRequest.filter((row) => row.emailOk);
  const selected = [
    ...(group === "all" || group === "A" ? aRows.map((row) => ({ row, type: "A" })) : []),
    ...(group === "all" || group === "B" ? bRows.map((row) => ({ row, type: "B" })) : []),
  ].slice(0, limit > 0 ? limit : undefined);

  console.log(`mode: ${mode}`);
  console.log(`selected: ${selected.length}`);

  if (mode === "dry-run") {
    console.log("No email sent. Use --test or --send.");
    if (selected[0]) {
      const sample = selected[0].type === "A"
        ? buildNoticeMail({ name: selected[0].row.name, url: selected[0].row.url })
        : buildRequestMail({ name: selected[0].row.name, url: selected[0].row.url });
      assertKoreanMailSafe(sample);
      console.log(`sample_subject: ${sample.subject}`);
      console.log(`sample_to_masked: ${maskEmail(selected[0].row.email)}`);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: requiredEnv("GMAIL_USER"), pass: requiredEnv("GMAIL_APP_PASSWORD") },
  });

  if (mode === "test") {
    if (!isValidEmail(testTo)) throw new Error("--to or TEST_EMAIL must be a valid email");
    const firstA = aRows[0];
    const firstB = bRows[0];
    if (!firstA || !firstB) throw new Error("Need at least one A and one B target for test mode");
    const sentA = await sendOne(transporter, firstA, "A", testTo);
    const sentB = await sendOne(transporter, firstB, "B", testTo);
    console.log(`test_sent_A: ${sentA.subject} -> ${maskEmail(testTo)}`);
    console.log(`test_sent_B: ${sentB.subject} -> ${maskEmail(testTo)}`);
    return;
  }

  if (confirm !== SEND_CONFIRM) {
    throw new Error(`Actual send requires --confirm=${SEND_CONFIRM}`);
  }
  if (SEND_LOCKED_AFTER_LOCATION_ERROR) {
    throw new Error("Actual send is locked after the 5F/3F location copy error. Review and unlock manually before any future send.");
  }

  let sent = 0;
  const failures = [];
  for (const item of selected) {
    try {
      const result = await sendOne(transporter, item.row, item.type);
      sent++;
      console.log(`sent ${sent}/${selected.length} group=${item.type} to=${maskEmail(result.to)} project=${item.row.code}`);
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (error) {
      failures.push({ item, error });
      console.error(`failed group=${item.type} to=${maskEmail(item.row.email)} project=${item.row.code}: ${error.message}`);
    }
  }

  console.log(`done sent=${sent} failed=${failures.length}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

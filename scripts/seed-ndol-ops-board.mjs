import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EVENT_KEY = "ndol-20260618";
const PROJECT_CODES = ["ndol26", "ndolsm", "ndol02", "ndolbd"];
const AUDITION_START = 16 * 60;
const AUDITION_END = 21 * 60;
const SITE_URL = "https://deetz.kr";
const EXTRA_RECRUITS = [
  { name: "\uC815\uC6D0\uC6B0", gender: "male" },
  { name: "\uCD5C\uC7A5\uC6B0", gender: "male" },
  { name: "\uC591\uCC44\uC724", gender: "female" },
];

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

function groupFor(row) {
  if (row.auditionWindow === "can") return "confirmed";
  if (row.status === "accepted" && row.auditionWindow === "unknown") {
    return "accepted_unknown";
  }
  if (row.status === "pending" && row.auditionWindow === "unknown") {
    return "pending_unknown";
  }
  return "recovery";
}

function defaultOutreachStatus(groupKey) {
  if (groupKey === "confirmed") return "available";
  if (groupKey === "recovery") return "unavailable";
  return "pending";
}

function managerForProject(projectCode) {
  if (projectCode === "ndol02") {
    return { manager_key: "baw", manager_name: "BAW(\uAE40\uC8FC\uC131)" };
  }
  return { manager_key: "hs", manager_name: "HS(\uC815\uD604\uC218)" };
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

function instagramValue(socialLinks) {
  const raw = socialLinks?.instagram;
  if (!raw) return null;
  const value = String(raw).trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") || null;
    } catch {
      return value.replace(/^@/, "");
    }
  }
  return value.replace(/^@/, "");
}

async function resolveEmail(admin, applicantId, profileId, privateEmail, sourceEmail) {
  if (applicantId) {
    const { data } = await admin.auth.admin.getUserById(applicantId);
    if (data?.user?.email) return data.user.email;
  }
  if (profileId) {
    const { data } = await admin.auth.admin.getUserById(profileId);
    if (data?.user?.email) return data.user.email;
  }
  return privateEmail || sourceEmail || null;
}

async function loadRows(admin) {
  const { data: projects, error: projectError } = await admin
    .from("projects")
    .select("id,title,short_code")
    .in("short_code", PROJECT_CODES);
  if (projectError) throw projectError;

  const projectIds = (projects ?? []).map((project) => project.id);
  const codeById = new Map((projects ?? []).map((project) => [project.id, project.short_code]));

  const { data: apps, error: appError } = await admin
    .from("applications")
    .select("project_id,status,dancer_id,applicant_id,created_at")
    .in("project_id", projectIds)
    .is("archived_at", null)
    .in("status", ["accepted", "pending"])
    .not("dancer_id", "is", null);
  if (appError) throw appError;

  const dancerIds = [...new Set((apps ?? []).map((app) => app.dancer_id).filter(Boolean))];
  const [{ data: dancers, error: dancerError }, { data: privateRows, error: privateError }] =
    await Promise.all([
      admin
        .from("dancers")
        .select("id,stage_name,korean_name,gender,slug,social_links,profile_id")
        .in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select("dancer_id,phone,email")
        .in("dancer_id", dancerIds),
    ]);
  if (dancerError) throw dancerError;
  if (privateError) throw privateError;

  const dancerById = new Map((dancers ?? []).map((dancer) => [dancer.id, dancer]));
  const privateByDancer = new Map((privateRows ?? []).map((row) => [row.dancer_id, row]));

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
    .select("schedule_id,dancer_id,status,time_slots,note,responded_at")
    .in("schedule_id", [...auditionScheduleIds]);
  if (responseError) throw responseError;

  const responseByTarget = new Map();
  for (const response of responses ?? []) {
    responseByTarget.set(`${projectBySchedule.get(response.schedule_id)}:${response.dancer_id}`, response);
  }

  const rows = [];
  const seen = new Set();
  for (const app of apps ?? []) {
    const sourceKey = `${app.project_id}:${app.dancer_id}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);

    const dancer = dancerById.get(app.dancer_id) ?? {};
    if (isDoNotContact(dancer)) continue;

    const projectCode = codeById.get(app.project_id) ?? "unknown";
    const priv = privateByDancer.get(app.dancer_id) ?? {};
    const socialLinks = dancer.social_links ?? {};
    const response = responseByTarget.get(sourceKey);
    const auditionWindow = canAuditionWindow(response);
    const groupKey = groupFor({ status: app.status, auditionWindow });
    const manager = managerForProject(projectCode);
    const email = await resolveEmail(
      admin,
      app.applicant_id,
      dancer.profile_id,
      priv.email,
      socialLinks.source_email,
    );

    rows.push({
      event_key: EVENT_KEY,
      source_key: sourceKey,
      dancer_id: app.dancer_id,
      project_id: app.project_id,
      project_code: projectCode,
      project_href: `${SITE_URL}/projects/${app.project_id}/applicants`,
      group_key: groupKey,
      ...manager,
      name: dancer.stage_name || "",
      gender: dancer.gender || "unknown",
      app_status: app.status,
      availability_status: auditionWindow,
      outreach_status: defaultOutreachStatus(groupKey),
      phone: priv.phone || null,
      instagram: instagramValue(socialLinks),
      email,
      note: response?.note || "",
    });
  }

  for (const extra of EXTRA_RECRUITS) {
    const groupKey = "confirmed";
    rows.push({
      event_key: EVENT_KEY,
      source_key: `extra:${extra.name}`,
      dancer_id: null,
      project_id: null,
      project_code: "\uCD94\uAC00\uC12D\uC678",
      project_href: null,
      group_key: groupKey,
      ...managerForProject("ndol26"),
      name: extra.name,
      gender: extra.gender,
      app_status: "confirmed_extra",
      availability_status: "can",
      outreach_status: defaultOutreachStatus(groupKey),
      phone: null,
      instagram: null,
      email: null,
      note: "\uCD9C\uC11D\uC5EC\uBD80\uC640 \uC2DC\uAC04 \uACF5\uC9C0 \uC644\uB8CC",
    });
  }

  return rows
    .map((row, index) => ({ ...row, sort_rank: index }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "ko"));
}

function sortKey(row) {
  const manager = row.manager_key === "baw" ? "0" : "1";
  const groupOrder = {
    confirmed: "0",
    accepted_unknown: "1",
    pending_unknown: "2",
    recovery: "3",
  }[row.group_key] ?? "9";
  const gender = row.gender === "male" ? "0" : row.gender === "unknown" ? "1" : "2";
  return `${manager}:${groupOrder}:${gender}:${row.project_code}:${row.name}`;
}

loadEnv(".env.local");

const admin = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rows = await loadRows(admin);

const { data: existingRows, error: existingError } = await admin
  .from("ops_ndol_contacts")
  .select("source_key,outreach_status,note")
  .eq("event_key", EVENT_KEY);
if (existingError) throw existingError;

const existingBySource = new Map((existingRows ?? []).map((row) => [row.source_key, row]));
const payload = rows.map((row, index) => {
  const existing = existingBySource.get(row.source_key);
  return {
    ...row,
    sort_rank: index,
    outreach_status: existing?.outreach_status ?? row.outreach_status,
    note: existing?.note ?? row.note,
    updated_at: new Date().toISOString(),
  };
});

const { error: upsertError } = await admin
  .from("ops_ndol_contacts")
  .upsert(payload, { onConflict: "event_key,source_key" });
if (upsertError) throw upsertError;

const summary = payload.reduce((acc, row) => {
  acc.total += 1;
  acc.managers[row.manager_key] = (acc.managers[row.manager_key] ?? 0) + 1;
  acc.groups[row.group_key] = (acc.groups[row.group_key] ?? 0) + 1;
  acc.status[row.outreach_status] = (acc.status[row.outreach_status] ?? 0) + 1;
  return acc;
}, { total: 0, managers: {}, groups: {}, status: {} });

console.log(JSON.stringify(summary, null, 2));

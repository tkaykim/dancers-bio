import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { escapeHtml } from "./lib/deetz-mail-layout.mjs";

const PROJECT_CODES = ["ndol26", "ndolsm", "ndol02", "ndolbd"];
const AUDITION_START = 16 * 60;
const AUDITION_END = 21 * 60;
const OUT_FILE = path.resolve("docs", "ndol-20260618-ops-brief.html");
const SITE_URL = "https://deetz.kr";
const EXTRA_RECRUITS = [
  { name: "\uC815\uC6D0\uC6B0", gender: "male" },
  { name: "\uCD5C\uC7A5\uC6B0", gender: "male" },
  { name: "\uC591\uCC44\uC724", gender: "female" },
];
const EXTRA_PROJECT_LABEL = "\uB300\uD45C\uB2D8 \uCD94\uAC00 \uC12D\uC678";

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

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

function genderLabel(value) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기재";
}

function statusLabel(value) {
  if (value === "accepted") return "승인된 사람";
  if (value === "confirmed_extra") return "\uD655\uC815";
  if (value === "pending") return "대기";
  if (value === "rejected") return "탈락";
  if (value === "withdrawn") return "철회";
  if (value === "extra") return "추가 섭외";
  return value || "-";
}

function windowLabel(value) {
  if (value === "can") return "16-21 가능";
  if (value === "cannot") return "16-21 불가";
  if (value === "unknown") return "미확인";
  if (value === "unknown_partial") return "부분응답 확인필요";
  return value || "-";
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

function instagramHref(value) {
  if (!value) return null;
  return `https://instagram.com/${value.replace(/^@/, "")}`;
}

function primaryContact(row) {
  if (row.phone) return { type: "전화", value: row.phone, href: `tel:${row.phone.replace(/[^\d+]/g, "")}` };
  if (row.instagram) return { type: "인스타", value: row.instagram, href: instagramHref(row.instagram) };
  if (row.email) return { type: "이메일", value: row.email, href: `mailto:${row.email}` };
  return { type: "없음", value: "-", href: null };
}

function contactHtml(row) {
  const primary = primaryContact(row);
  const detail = [];
  if (row.phone) detail.push(`전화 ${escapeHtml(row.phone)}`);
  if (row.instagram) {
    const href = instagramHref(row.instagram);
    detail.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">인스타 ${escapeHtml(row.instagram)}</a>`);
  }
  if (row.email) detail.push(`<a href="mailto:${escapeHtml(row.email)}">이메일 ${escapeHtml(row.email)}</a>`);
  const primaryPart = primary.href
    ? `<a class="contact-primary" href="${escapeHtml(primary.href)}" target="_blank" rel="noreferrer">${escapeHtml(primary.type)}: ${escapeHtml(primary.value)}</a>`
    : `<span class="contact-primary">${escapeHtml(primary.type)}: ${escapeHtml(primary.value)}</span>`;
  return `${primaryPart}<div class="contact-detail">${detail.join(" · ") || "-"}</div>`;
}

function rowHtml(row, idx, includeMission = false) {
  const projectCell = row.projectHref
    ? `<a class="project-link" href="${escapeHtml(row.projectHref)}" target="_blank" rel="noreferrer">${escapeHtml(row.project)}</a>`
    : escapeHtml(row.project);
  return `<tr data-gender="${escapeHtml(row.gender)}">
    <td class="num">${idx + 1}</td>
    <td><b>${escapeHtml(row.name)}</b></td>
    <td>${projectCell}</td>
    <td><span class="pill">${escapeHtml(statusLabel(row.status))}</span></td>
    <td>${escapeHtml(genderLabel(row.gender))}</td>
    <td>${escapeHtml(windowLabel(row.auditionWindow))}</td>
    <td>${contactHtml(row)}</td>
    ${includeMission ? `<td>${escapeHtml(row.mission)}</td>` : ""}
  </tr>`;
}

function tableHtml(title, subtitle, rows, includeMission = false) {
  return `<section data-view="${escapeHtml(rows[0]?.view || "misc")}">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="count">${rows.length}명</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>#</th><th>이름</th><th>프로젝트</th><th>상태</th><th>성별</th><th>일정</th><th>우선 연락처</th>${includeMission ? "<th>PM 미션</th>" : ""}
        </tr></thead>
        <tbody>${rows.map((row, idx) => rowHtml(row, idx, includeMission)).join("\n")}</tbody>
      </table>
    </div>
  </section>`;
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

async function loadRows() {
  loadEnv(".env.local");
  const admin = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
  const [{ data: dancers, error: dancerError }, { data: privateRows, error: privateError }] = await Promise.all([
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
    const key = `${app.project_id}:${app.dancer_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dancer = dancerById.get(app.dancer_id) ?? {};
    if (isDoNotContact(dancer)) continue;
    const priv = privateByDancer.get(app.dancer_id) ?? {};
    const socialLinks = dancer.social_links ?? {};
    const email = await resolveEmail(
      admin,
      app.applicant_id,
      dancer.profile_id,
      priv.email,
      socialLinks.source_email,
    );
    const response = responseByTarget.get(key);
    rows.push({
      key,
      dancerId: app.dancer_id,
      name: dancer.stage_name || "",
      slug: "",
      project: codeById.get(app.project_id),
      projectHref: `${SITE_URL}/projects/${app.project_id}/applicants`,
      status: app.status,
      gender: dancer.gender || "unknown",
      auditionWindow: canAuditionWindow(response),
      responseStatus: response?.status || "none",
      phone: priv.phone || null,
      instagram: instagramValue(socialLinks),
      email,
      note: response?.note || "",
    });
  }
  return rows;
}

function buildHtml(rows) {
  const extraRecruits = EXTRA_RECRUITS.map((row) => ({
    ...row,
    project: EXTRA_PROJECT_LABEL,
    projectHref: null,
    status: "confirmed_extra",
    auditionWindow: "can",
    phone: null,
    instagram: null,
    email: null,
    mission: "",
    view: "confirmed",
  }));
  const dbConfirmed = rows
    .filter((row) => row.auditionWindow === "can")
    .map((row) => ({ ...row, view: "confirmed" }))
    .sort(sortForOps);
  const confirmed = [...dbConfirmed, ...extraRecruits].sort(sortForOps);
  const acceptedUnknown = rows
    .filter((row) => row.status === "accepted" && row.auditionWindow === "unknown")
    .map((row) => ({ ...row, mission: "오늘 중 전화→인스타→이메일 순으로 16:00-21:00 가능 여부 확인", view: "accepted-unknown" }))
    .sort(sortForOps);
  const pendingUnknown = rows
    .filter((row) => row.status === "pending" && row.auditionWindow === "unknown")
    .map((row) => ({ ...row, mission: "70명 미달 시 영상 빠른 검토 후 예비 연락", view: "pending-unknown" }))
    .sort(sortForOps);
  const recoveryPool = rows
    .filter((row) => row.auditionWindow === "cannot" || row.auditionWindow === "unknown_partial")
    .map((row) => ({ ...row, mission: "이미 일정 불가 안내 발송. 회신으로 조정 가능하다고 오면 확정 후보로 회수", view: "recovery" }))
    .sort(sortForOps);

  const confirmedMale = confirmed.filter((row) => row.gender === "male").length;
  const confirmedFemale = confirmed.filter((row) => row.gender === "female").length;
  const operationalBase = confirmed.length;
  const target70Gap = Math.max(0, 70 - operationalBase);
  const target80Gap = Math.max(0, 80 - operationalBase);
  const acceptedUnknownMale = acceptedUnknown.filter((row) => row.gender === "male").length;

  const generatedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>6/18 남자아이돌 오디션 운영 브리프</title>
  <style>
    :root { color-scheme: light; --ink:#171717; --muted:#6b7280; --line:#e5e7eb; --soft:#f6f7f9; --brand:#111; --good:#0f766e; --warn:#b45309; --bad:#b91c1c; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: var(--ink); font-family: "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif; line-height: 1.55; }
    .page { max-width: 1280px; margin: 0 auto; padding: 28px 28px 56px; }
    header { border-bottom: 2px solid var(--ink); padding-bottom: 18px; margin-bottom: 22px; }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    .meta { margin-top: 8px; color: var(--muted); font-size: 13px; }
    .notice { margin-top: 14px; padding: 12px 14px; border: 1px solid var(--line); background: var(--soft); border-radius: 8px; font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
    .card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
    .card .label { color: var(--muted); font-size: 12px; }
    .card .value { font-size: 28px; font-weight: 800; margin-top: 4px; }
    .card .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .plan { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; margin-bottom: 24px; }
    .panel { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: #fff; }
    .panel h2 { margin: 0 0 10px; font-size: 18px; }
    .panel ol, .panel ul { margin: 0; padding-left: 20px; }
    .panel li { margin: 6px 0; }
    section { margin-top: 28px; break-inside: avoid; }
    .section-head { display: flex; justify-content: space-between; gap: 16px; align-items: end; border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 10px; }
    .section-head h2 { margin: 0; font-size: 20px; }
    .section-head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .count { font-size: 22px; font-weight: 800; white-space: nowrap; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 980px; }
    th { background: #f9fafb; text-align: left; border-bottom: 1px solid var(--line); padding: 9px 10px; white-space: nowrap; }
    td { border-bottom: 1px solid #f0f1f3; padding: 8px 10px; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .num { color: var(--muted); width: 42px; text-align: right; }
    .muted { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .pill { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; background: #fff; white-space: nowrap; }
    .contact-primary { font-weight: 700; color: var(--brand); text-decoration: none; }
    .contact-detail { color: var(--muted); font-size: 11px; margin-top: 3px; }
    .contact-detail a { color: var(--muted); }
    .project-link { color: var(--brand); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
    .toolbar { display:flex; flex-wrap:wrap; gap:8px; margin: 18px 0 10px; padding: 10px; border:1px solid var(--line); border-radius:8px; background:#fafafa; position: sticky; top: 0; z-index: 3; }
    .toolbar .group { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding-right:10px; border-right:1px solid var(--line); }
    .toolbar .group:last-child { border-right:none; }
    .toolbar-label { color: var(--muted); font-size: 12px; font-weight: 700; margin-right: 2px; }
    .toolbar button { border:1px solid var(--line); background:#fff; color:#111; border-radius:999px; padding:8px 12px; font: inherit; font-size: 13px; cursor:pointer; }
    .toolbar button.active { background:#111; color:#fff; border-color:#111; }
    body.view-confirmed section:not([data-view="confirmed"]),
    body.view-accepted-unknown section:not([data-view="accepted-unknown"]),
    body.view-pending-unknown section:not([data-view="pending-unknown"]),
    body.view-recovery section:not([data-view="recovery"]) { display:none; }
    body.gender-male tr[data-gender]:not([data-gender="male"]),
    body.gender-female tr[data-gender]:not([data-gender="female"]),
    body.gender-unknown tr[data-gender]:not([data-gender="unknown"]) { display:none; }
    body.gender-male tbody:not(:has(tr[data-gender="male"])),
    body.gender-female tbody:not(:has(tr[data-gender="female"])),
    body.gender-unknown tbody:not(:has(tr[data-gender="unknown"])) { min-height: 44px; display: table-row-group; }
    .tag-good { color: var(--good); font-weight: 800; }
    .tag-warn { color: var(--warn); font-weight: 800; }
    @media print {
      .page { max-width: none; padding: 18mm 12mm; }
      .cards, .plan { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { position: static; }
      .table-wrap { overflow: visible; }
      table { min-width: 0; font-size: 10px; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <h1>6/18 남자아이돌 오디션 운영 브리프</h1>
      <div class="meta">생성: ${escapeHtml(generatedAt)} · 기준 일정: 2026년 6월 18일 16:00-21:00 · 내부 운영/클라이언트 미팅용</div>
      <div class="notice">개인 연락처가 포함된 내부 자료입니다. 외부 전달 시 상세 명단 영역은 제외하거나 화면 공유 범위를 제한해 주세요.</div>
    </header>

    <div class="cards">
      <div class="card"><div class="label">${"\uD655\uC815 \uCC38\uC11D \uAC00\uB2A5"}</div><div class="value">${confirmed.length}</div><div class="sub">${"\uB0A8"} ${confirmedMale} · ${"\uC5EC"} ${confirmedFemale} · ${"\uBBF8\uAE30\uC7AC"} ${confirmed.length - confirmedMale - confirmedFemale}</div></div>
      <div class="card"><div class="label">${"DB \uAE30\uC900 \uAC00\uB2A5"}</div><div class="value">${dbConfirmed.length}</div><div class="sub">${"\uCD94\uAC00 \uC12D\uC678"} ${extraRecruits.length}${"\uBA85 \uD3EC\uD568"}</div></div>
      <div class="card"><div class="label">${"\uB0A8\uC131 \uD655\uBCF4"}</div><div class="value">${confirmedMale}</div><div class="sub">${"\uB0A8\uC790 \uBAA9\uD45C 40\uBA85 \uAE30\uC900"}</div></div>
      <div class="card"><div class="label">70명 목표 부족분</div><div class="value">${target70Gap}</div><div class="sub">최소 확보 필요 인원</div></div>
      <div class="card"><div class="label">80명 목표 부족분</div><div class="value">${target80Gap}</div><div class="sub">상한 목표 기준</div></div>
      <div class="card"><div class="label">승인 미확인 풀</div><div class="value">${acceptedUnknown.length}</div><div class="sub">남 ${acceptedUnknownMale} · 여 ${acceptedUnknown.length - acceptedUnknownMale}</div></div>
    </div>

    <div class="plan">
      <div class="panel">
        <h2>운영 판단</h2>
        <ol>
          <li>확정 참석 가능자는 <b>${confirmed.length}명</b>입니다. DB 기준 ${dbConfirmed.length}명과 대표님 추가 섭외 ${extraRecruits.length}명을 합산했습니다.</li>
          <li>70명 기준 <b>${target70Gap}명</b>, 80명 기준 <b>${target80Gap}명</b>이 부족합니다.</li>
          <li>가장 먼저 연락할 풀은 <b>승인된 사람 + 일정 미확인 ${acceptedUnknown.length}명</b>입니다. 이 중 남성 ${acceptedUnknownMale}명은 최우선 연락 대상입니다.</li>
          <li>승인 미확인 풀에서 ${target70Gap}명 이상 가능 확인이 나오면 70명 목표를 충족합니다.</li>
          <li>그래도 부족하면 pending 미확인 ${pendingUnknown.length}명을 영상 빠른 검토 후 예비 투입합니다.</li>
          <li>이미 16-21 불가 안내를 받은 ${recoveryPool.length}명은 회신 모니터링 대상입니다. 일정 조정 가능 회신이 오면 즉시 확정 후보로 회수합니다.</li>
        </ol>
      </div>
      <div class="panel">
        <h2>PM 미션</h2>
        <ul>
          <li><b>1차:</b> 승인 미확인자에게 전화 우선 연락. 질문은 “내일 15:50 도착, 16:00-21:00 전체 참석 가능하신가요?”로 통일합니다.</li>
          <li><b>2차:</b> 전화 부재 시 인스타 DM, 없으면 이메일로 동일 문구를 보냅니다.</li>
          <li><b>남성 우선:</b> 남성 후보는 가능 여부 확인 즉시 확정 명단에 반영합니다.</li>
          <li><b>회신 모니터링:</b> 일정 조정 가능 회신은 별도 스프레드시트/메모에 즉시 기록합니다.</li>
          <li><b>마감 판단:</b> 70명 미만이면 pending 미확인자 검토를 바로 시작합니다.</li>
        </ul>
      </div>
    </div>

    <div class="toolbar" aria-label="명단 보기 전환">
      <div class="group">
        <span class="toolbar-label">상태</span>
        <button type="button" class="active" data-view-filter="all">전체</button>
        <button type="button" data-view-filter="confirmed">확정 가능</button>
        <button type="button" data-view-filter="accepted-unknown">일정확인 1순위</button>
        <button type="button" data-view-filter="pending-unknown">예비 검토</button>
        <button type="button" data-view-filter="recovery">회신 모니터링</button>
      </div>
      <div class="group">
        <span class="toolbar-label">성별</span>
        <button type="button" class="active" data-gender-filter="all">전체</button>
        <button type="button" data-gender-filter="male">남</button>
        <button type="button" data-gender-filter="female">여</button>
        <button type="button" data-gender-filter="unknown">미기재</button>
      </div>
    </div>

    ${tableHtml("내일 확정 참석 가능 명단", "현재 DB에서 6/18 16:00-21:00 전체 가능으로 확인된 명단과 대표님 추가 섭외 인원을 합친 명단입니다.", confirmed)}
    ${tableHtml("일정확인 연락 필요 명단 - 1순위", "매니저 검토 통과로 승인된 사람이지만 16:00-21:00 가능 여부가 아직 미확인인 명단입니다.", acceptedUnknown, true)}
    ${tableHtml("예비 연락 명단 - 2순위", "70명 미달 시 빠른 검토 후 연락할 pending 미확인 명단입니다.", pendingUnknown, true)}
    ${tableHtml("회신 모니터링 명단", "16:00-21:00 전체 참석 불가로 안내를 보냈으나, 일정 조정 가능 회신이 오면 회수할 수 있는 후보입니다.", recoveryPool, true)}
  </main>
  <script>
    const viewButtons = document.querySelectorAll("[data-view-filter]");
    const genderButtons = document.querySelectorAll("[data-gender-filter]");

    function setBodyClass(prefix, value) {
      document.body.className = document.body.className
        .split(" ")
        .filter((name) => name && !name.startsWith(prefix))
        .join(" ");
      if (value !== "all") {
        document.body.classList.add(prefix + value);
      }
    }

    viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        viewButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        setBodyClass("view-", button.dataset.viewFilter);
      });
    });

    genderButtons.forEach((button) => {
      button.addEventListener("click", () => {
        genderButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        setBodyClass("gender-", button.dataset.genderFilter);
      });
    });
  </script>
</body>
</html>`;
}

function sortForOps(a, b) {
  const genderWeight = (row) => (row.gender === "male" ? 0 : row.gender === "unknown" ? 1 : 2);
  return (
    genderWeight(a) - genderWeight(b) ||
    String(a.project).localeCompare(String(b.project)) ||
    String(a.name).localeCompare(String(b.name), "ko")
  );
}

const rows = await loadRows();
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, buildHtml(rows), "utf8");
console.log(OUT_FILE);

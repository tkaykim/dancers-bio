#!/usr/bin/env node
/**
 * 트리아지 A등급 일괄 승인 (조용히 — 메일·알림톡 발송 없음).
 *
 * 왜 스크립트인가: 트리아지 화면(/admin/dancers/triage)이 아직 prod 에 없다(PR #112 미머지).
 * 다만 판정 규칙은 **앱과 같은 src/lib/scoring/triage.ts 를 그대로 import** 해서 쓴다.
 * 규칙을 여기에 다시 적지 않는다 — 두 곳에 두면 반드시 갈라진다.
 * 승인 자체도 앱 서버액션과 **같은 RPC**(admin_bulk_approve_dancers, service_role 전용)를 호출한다.
 *
 * 기본 dry-run. 실제 승인은 --approve --confirm=TIER_A 가 모두 있을 때만.
 *
 *   node scripts/approve-tier-a.mjs                      # 대상 미리보기
 *   node scripts/approve-tier-a.mjs --include-name-dup   # 동명 충돌건까지 포함
 *   node scripts/approve-tier-a.mjs --approve --confirm=TIER_A
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

// 앱과 동일한 판정 규칙을 그대로 가져온다 — 규칙을 여기에 다시 쓰지 않기 위해서다.
// triage.ts 가 현재 브랜치에 없으면(PR #112 미머지 상태) 그 브랜치에서 꺼내 임시파일로 읽는다.
// 여러 세션이 같은 워킹트리에서 브랜치를 바꿔가며 쓰고 있어 파일 존재를 보장할 수 없다.
const RULE_PATH = "src/lib/scoring/triage.ts";
const RULE_BRANCH = process.env.TRIAGE_RULE_REF || "chore/salvage-uncommitted-20260814";

async function loadRules() {
  const local = resolve(process.cwd(), RULE_PATH);
  if (existsSync(local)) return import(pathToFileURL(local).href);
  try {
    const src = execFileSync("git", ["show", `${RULE_BRANCH}:${RULE_PATH}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const tmp = join(tmpdir(), `deetz-triage-${process.pid}.ts`);
    writeFileSync(tmp, src, "utf8");
    console.log(`(판정 규칙을 ${RULE_BRANCH} 에서 읽었습니다 — 현재 브랜치에 파일 없음)`);
    return await import(pathToFileURL(tmp).href);
  } catch (e) {
    console.error(
      `판정 규칙(${RULE_PATH})을 찾을 수 없습니다.\n` +
        `PR #112 가 머지되면 현재 브랜치에서 바로 읽힙니다.\n${String(e?.message ?? e).slice(0, 200)}`,
    );
    process.exit(1);
  }
}
const { triageDancer, normalizeName } = await loadRules();

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const LIVE = args.get("approve") === "true" && args.get("confirm") === "TIER_A";
// --min-score=N : 트리아지 A등급 대신 "프로필 완성도 N점 이상"으로 대상을 고른다.
// 부실한 프로필은 승인하지 않고 pending 으로 두고 보완을 요청한다는 방침(2026-08-14 대표).
const MIN_SCORE = args.has("min-score") ? Number(args.get("min-score")) : null;
const INCLUDE_NAME_DUP = args.get("include-name-dup") === "true";
const LIMIT = Number(args.get("limit") ?? 300);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const PAGE = 1000;
async function fetchAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

const dancers = await fetchAll(
  "dancers",
  "id, stage_name, korean_name, slug, profile_img, genres, social_links, is_verified, profile_id, approval_status, is_active",
);
const careers = await fetchAll("careers", "dancer_id");
const careerCount = new Map();
for (const c of careers) if (c.dancer_id) careerCount.set(c.dancer_id, (careerCount.get(c.dancer_id) ?? 0) + 1);

const privs = await fetchAll("dancer_private_info", "dancer_id, phone");
const profiles = await fetchAll("profiles", "id, phone");
const profPhone = new Map(profiles.filter((p) => p.phone?.trim()).map((p) => [p.id, p.phone]));
const phoneBy = new Map();
for (const p of privs) if (p.phone?.trim()) phoneBy.set(p.dancer_id, p.phone);
for (const d of dancers) {
  if (!phoneBy.has(d.id) && d.profile_id && profPhone.has(d.profile_id)) {
    phoneBy.set(d.id, profPhone.get(d.profile_id));
  }
}

// 중복 신호 (강=연락처 / 약=활동명) — triage-data.ts 와 같은 방식.
const byName = new Map(), byPhone = new Map();
for (const d of dancers) {
  const n = normalizeName(d.stage_name) || normalizeName(d.korean_name);
  if (n.length >= 2) byName.set(n, [...(byName.get(n) ?? []), d.id]);
  const digits = (phoneBy.get(d.id) ?? "").replace(/\D/g, "");
  if (digits.length >= 9) byPhone.set(digits, [...(byPhone.get(digits) ?? []), d.id]);
}
const strong = new Set(), weak = new Set();
for (const g of byPhone.values()) if (g.length > 1) g.forEach((id) => strong.add(id));
for (const g of byName.values()) if (g.length > 1) g.forEach((id) => weak.add(id));

// 영상 링크가 있는 경력 수 (careers.details->>'link')
const videoCount = new Map();
for (const c of await fetchAll("careers", "dancer_id, details")) {
  const link = c?.details?.link;
  if (c.dancer_id && typeof link === "string" && link.trim()) {
    videoCount.set(c.dancer_id, (videoCount.get(c.dancer_id) ?? 0) + 1);
  }
}

// src/lib/scoring/profile-score.ts 와 동일 배점 (총 20점)
function profileScore(d) {
  const careers = careerCount.get(d.id) ?? 0;
  const sns = Object.values(d.social_links ?? {}).filter(
    (v) => typeof v === "string" && v.trim(),
  ).length;
  return (
    (d.profile_img && String(d.profile_img).trim() ? 4 : 0) +
    ((d.genres?.length ?? 0) > 0 ? 2 : 0) +
    (d.bio && String(d.bio).trim().length >= 20 ? 2 : 0) +
    (sns > 0 ? 2 : 0) +
    (careers >= 3 ? 4 : careers >= 1 ? 2 : 0) +
    ((videoCount.get(d.id) ?? 0) >= 1 ? 3 : 0) +
    (phoneBy.has(d.id) ? 3 : 0)
  );
}

const TEST_PATTERN = /(^|[^a-z])e2e|test|테스트/i;
const rows = [];
for (const d of dancers) {
  if (d.approval_status !== "pending" || d.is_active === false) continue;
  if (TEST_PATTERN.test(d.stage_name ?? "") || TEST_PATTERN.test(d.slug ?? "")) continue;
  const t = triageDancer({
    stageName: d.stage_name,
    profileImg: d.profile_img,
    genres: d.genres,
    socialLinks: d.social_links,
    careerCount: careerCount.get(d.id) ?? 0,
    isVerified: d.is_verified,
    hasAccount: !!d.profile_id,
    duplicateStrong: strong.has(d.id),
    duplicateWeak: weak.has(d.id),
  });
  // 연락처 중복(강한 신호)은 어떤 기준에서도 자동 승인하지 않는다.
  if (t.tier === "REVIEW") continue;
  const score = profileScore(d);
  const pick = MIN_SCORE == null ? t.tier === "A" && t.autoApprovable : score >= MIN_SCORE;
  if (pick) {
    rows.push({
      ...d,
      careers: careerCount.get(d.id) ?? 0,
      score,
      needsEyeball: t.needsEyeball,
    });
  }
}

const clean = rows.filter((r) => !r.needsEyeball);
const flagged = rows.filter((r) => r.needsEyeball);
const targets = (INCLUDE_NAME_DUP ? rows : clean).slice(0, LIMIT);

console.log(
  MIN_SCORE == null
    ? `A등급 ${rows.length}명 — 충돌없음 ${clean.length} / 동명충돌 ${flagged.length}`
    : `프로필 ${MIN_SCORE}점 이상 ${rows.length}명 — 충돌없음 ${clean.length} / 동명충돌 ${flagged.length}`,
);
console.log(`이번 대상: ${targets.length}명${INCLUDE_NAME_DUP ? " (동명충돌 포함)" : " (동명충돌 제외)"}`);
console.log(LIVE ? "*** 실제 승인 모드 ***" : "dry-run (DB 변경 없음)");
for (const r of targets.slice(0, 15)) {
  console.log(
    `  ${r.stage_name}${r.korean_name ? ` (${r.korean_name})` : ""} · 경력 ${r.careers}` +
      (r.score != null ? ` · 완성도 ${r.score}/20` : ""),
  );
}
if (targets.length > 15) console.log(`  … 외 ${targets.length - 15}명`);

if (!LIVE) {
  console.log("\n실제 승인: --approve --confirm=TIER_A 를 함께 넘기세요.");
  console.log("승인해도 메일·알림톡은 나가지 않습니다(조용한 승인).");
  process.exit(0);
}

const { data, error } = await db.rpc("admin_bulk_approve_dancers", {
  p_ids: targets.map((t) => t.id),
  p_note: "script:tierA",
});
if (error) {
  console.error("승인 실패:", error.message);
  process.exit(1);
}
console.log(`\n승인 완료: ${Array.isArray(data) ? data.length : targets.length}명`);

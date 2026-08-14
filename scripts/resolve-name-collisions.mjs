#!/usr/bin/env node
/**
 * 동명충돌 판정 + 승인 (사람 확인 대체용 자동 대조).
 *
 * 같은 활동명 그룹 안에서 **세 가지 신호로 동일인을 연결(union-find)** 한다:
 *   ① 정규화 인스타 핸들 일치   ② 전화번호 일치   ③ 본명(korean_name) 일치
 * 하나라도 걸리면 같은 사람으로 본다. 신호 하나만 쓰면 구멍이 생긴다 —
 * 예: Ronni 는 핸들이 서로 다른데(Ni_ronni_ka / Veronika_Ronni) 전화번호가 같은 동일인이고,
 *     다혜는 한쪽에 전화번호가 없어 핸들로만 이어진다.
 *
 * 판정 후:
 *   - 동일인 묶음 → 경력이 가장 많은 행 1개만 승인, 나머지는 pending 유지(병합 대상)
 *   - 서로 다른 사람 → 각자 승인
 *   - 사진 없음 / 경력 0 은 어느 쪽이든 승인하지 않는다(기존 게이트 유지)
 *
 * 기본 dry-run. 실제 승인은 --approve --confirm=COLLISION.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const LIVE = args.get("approve") === "true" && args.get("confirm") === "COLLISION";

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

const norm = (s) =>
  (s ?? "").toLowerCase().replace(/[\s._\-()[\]]/g, "").trim();
const normIg = (v) =>
  (v ?? "")
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/+$/, "")
    .replace(/^@/, "")
    .trim();

const dancers = await fetchAll(
  "dancers",
  "id, stage_name, korean_name, slug, profile_img, social_links, approval_status, is_active",
);
const cc = new Map();
for (const c of await fetchAll("careers", "dancer_id")) {
  if (c.dancer_id) cc.set(c.dancer_id, (cc.get(c.dancer_id) ?? 0) + 1);
}
const phone = new Map();
for (const p of await fetchAll("dancer_private_info", "dancer_id, phone")) {
  const d = (p.phone ?? "").replace(/\D/g, "");
  if (d.length >= 9) phone.set(p.dancer_id, d);
}
const profPhone = new Map();
for (const p of await fetchAll("profiles", "id, phone")) {
  const d = (p.phone ?? "").replace(/\D/g, "");
  if (d.length >= 9) profPhone.set(p.id, d);
}

const rows = dancers
  .filter((d) => d.is_active !== false)
  .map((d) => ({
    id: d.id,
    stage_name: d.stage_name,
    korean_name: d.korean_name,
    status: d.approval_status,
    hasImg: !!(d.profile_img && String(d.profile_img).trim()),
    careers: cc.get(d.id) ?? 0,
    nname: norm(d.stage_name) || norm(d.korean_name),
    ig: normIg(d.social_links?.instagram),
    ph: phone.get(d.id) ?? profPhone.get(d.profile_id) ?? "",
  }))
  .filter((r) => r.nname.length >= 2);

// 같은 활동명 그룹만 대상
const byName = new Map();
for (const r of rows) byName.set(r.nname, [...(byName.get(r.nname) ?? []), r]);

// union-find
const parent = new Map();
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const union = (a, b) => {
  const [ra, rb] = [find(a), find(b)];
  if (ra !== rb) parent.set(ra, rb);
};

const approve = [];
const merge = [];
const skipped = [];

for (const [nname, group] of byName) {
  if (group.length < 2) continue;
  for (const r of group) parent.set(r.id, r.id);
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      const sameIg = a.ig && b.ig && a.ig === b.ig;
      const samePh = a.ph && b.ph && a.ph === b.ph;
      const sameReal =
        a.korean_name && b.korean_name && norm(a.korean_name) === norm(b.korean_name);
      if (sameIg || samePh || sameReal) union(a.id, b.id);
    }
  }
  const comps = new Map();
  for (const r of group) {
    const k = find(r.id);
    comps.set(k, [...(comps.get(k) ?? []), r]);
  }
  for (const members of comps.values()) {
    const sorted = [...members].sort((x, y) => y.careers - x.careers);
    const alreadyApproved = sorted.some((m) => m.status === "approved");
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      if (r.status !== "pending") continue;
      const isPrimary = i === 0 && !alreadyApproved;
      if (!isPrimary) {
        merge.push({ ...r, reason: alreadyApproved ? "이미 승인된 동일인 있음" : "동일인 보조 프로필" });
        continue;
      }
      if (!r.hasImg) { skipped.push({ ...r, reason: "사진 없음" }); continue; }
      if (r.careers < 1) { skipped.push({ ...r, reason: "경력 0" }); continue; }
      approve.push({ ...r, dupOf: members.length > 1 ? "중복대표" : "별개" });
    }
  }
}

console.log(`승인 대상 ${approve.length}명 · 병합대기 ${merge.length}명 · 자격미달 ${skipped.length}명`);
console.log(LIVE ? "*** 실제 승인 모드 ***" : "dry-run (DB 변경 없음)");
for (const r of approve.sort((a, b) => b.careers - a.careers)) {
  console.log(`  ✓ ${r.stage_name} (${r.korean_name ?? "-"}) 경력${r.careers} [${r.dupOf}]`);
}
console.log("\n-- 병합 대기(승인 안 함) --");
for (const r of merge.sort((a, b) => b.careers - a.careers).slice(0, 20)) {
  console.log(`  · ${r.stage_name} (${r.korean_name ?? "-"}) 경력${r.careers} — ${r.reason}`);
}
if (merge.length > 20) console.log(`  … 외 ${merge.length - 20}명`);

if (!LIVE) {
  console.log("\n실제 승인: --approve --confirm=COLLISION");
  process.exit(0);
}

const { data, error } = await db.rpc("admin_bulk_approve_dancers", {
  p_ids: approve.map((a) => a.id),
  p_note: "script:collision-resolved",
});
if (error) {
  console.error("승인 실패:", error.message);
  process.exit(1);
}
console.log(`\n승인 완료: ${Array.isArray(data) ? data.length : approve.length}명`);

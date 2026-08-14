#!/usr/bin/env node
/**
 * 동명충돌 판정 감사 — "본명도 다르고 가입 이메일도 다르면 별개 프로필" 원칙 검증.
 *
 * resolve-name-collisions.mjs 가 IG핸들/전화번호/본명 중 하나라도 걸리면 동일인으로 묶는데,
 * 대표 지시(2026-08-14): **성·이름이 다르고 가입 주소도 다르면 동명이인이어도 별개다.**
 * 그런 행이 승인 보류(병합대기)로 잘못 잡혀 있는지 찾아낸다.
 *
 * 데이터를 바꾸지 않는 읽기 전용 감사다.
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

const norm = (s) => (s ?? "").toLowerCase().replace(/[\s._\-()[\]]/g, "").trim();
const normIg = (v) =>
  (v ?? "").toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/+$/, "").replace(/^@/, "").trim();

const dancers = (await fetchAll(
  "dancers",
  "id, stage_name, korean_name, profile_img, social_links, approval_status, is_active, profile_id",
)).filter((d) => d.is_active !== false);

const cc = new Map();
for (const c of await fetchAll("careers", "dancer_id")) {
  if (c.dancer_id) cc.set(c.dancer_id, (cc.get(c.dancer_id) ?? 0) + 1);
}
const priv = new Map();
for (const p of await fetchAll("dancer_private_info", "dancer_id, phone, email")) {
  priv.set(p.dancer_id, p);
}
const profs = new Map();
for (const p of await fetchAll("profiles", "id, phone")) profs.set(p.id, p);

// 가입 이메일 — auth 계정 우선, 없으면 비공개정보 이메일
const authEmail = new Map();
for (const d of dancers) {
  if (!d.profile_id) continue;
  const { data } = await db.auth.admin.getUserById(d.profile_id);
  if (data?.user?.email) authEmail.set(d.id, data.user.email.toLowerCase());
}

const rows = dancers.map((d) => ({
  id: d.id,
  stage_name: d.stage_name,
  korean_name: d.korean_name,
  status: d.approval_status,
  careers: cc.get(d.id) ?? 0,
  hasImg: !!(d.profile_img && String(d.profile_img).trim()),
  nname: norm(d.stage_name) || norm(d.korean_name),
  ig: normIg(d.social_links?.instagram),
  ph: (priv.get(d.id)?.phone ?? profs.get(d.profile_id)?.phone ?? "").replace(/\D/g, ""),
  email: authEmail.get(d.id) ?? (priv.get(d.id)?.email ?? "").toLowerCase(),
})).filter((r) => r.nname.length >= 2);

const byName = new Map();
for (const r of rows) byName.set(r.nname, [...(byName.get(r.nname) ?? []), r]);

const parent = new Map();
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const union = (a, b) => { const [ra, rb] = [find(a), find(b)]; if (ra !== rb) parent.set(ra, rb); };

const suspect = [];
for (const [, group] of byName) {
  if (group.length < 2) continue;
  for (const r of group) parent.set(r.id, r.id);
  const links = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      const sameIg = a.ig && b.ig && a.ig === b.ig;
      const samePh = a.ph && b.ph && a.ph === b.ph;
      const sameReal = a.korean_name && b.korean_name && norm(a.korean_name) === norm(b.korean_name);
      if (sameIg || samePh || sameReal) { union(a.id, b.id); links.push({ a, b, sameIg, samePh, sameReal }); }
    }
  }
  // 대표 원칙 위반 후보: 묶였는데 본명도 다르고 이메일도 다른 쌍
  for (const l of links) {
    // "본명 다름" = 양쪽 다 값이 있고 서로 다른 경우만. 한쪽이 비어 있는 건 '다름'이 아니다.
    const realDiff =
      !!l.a.korean_name && !!l.b.korean_name &&
      norm(l.a.korean_name) !== norm(l.b.korean_name);
    const emailDiff = l.a.email && l.b.email && l.a.email !== l.b.email;
    if (realDiff && emailDiff) suspect.push(l);
  }
}

// 승인 보류된 행 중, 위 원칙상 별개로 봐야 하는 것
console.log(`의심 링크 ${suspect.length}건 (본명 다름 + 가입 이메일 다름인데 동일인으로 묶임)\n`);
for (const s of suspect) {
  const why = [s.sameIg && "IG동일", s.samePh && "폰동일", s.sameReal && "본명동일"].filter(Boolean).join("+");
  console.log(`[${why}] ${s.a.stage_name}(${s.a.korean_name ?? "-"}/${s.a.email || "-"}/${s.a.status}/경력${s.a.careers})`);
  console.log(`        ↔ ${s.b.stage_name}(${s.b.korean_name ?? "-"}/${s.b.email || "-"}/${s.b.status}/경력${s.b.careers})`);
}
if (suspect.length === 0) console.log("없음 — 묶인 건들은 전부 본명 또는 이메일이 일치합니다.");

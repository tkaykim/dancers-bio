// 프로필 독려 메일 발송 후, 받은 사람들 중 실제로 경력(careers)을 추가한 사람 집계.
// 사용: node scripts/nudge-impact.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const ENV = loadEnv();
const supa = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CUTOFF = "2026-06-27T09:00:00+09:00"; // 발송 시작(09:30 KST) 직전
const ledger = JSON.parse(readFileSync(join(__dirname, ".profile-nudge-sent.json"), "utf8"));
const sentIds = Object.keys(ledger.sent);
console.log(`발송받은 댄서: ${sentIds.length}명, 기준시각(이후 변경 측정): ${CUTOFF}`);

// 1) 발송 후 추가된 careers (발송 대상자 한정)
const { data: newCareers, error: e1 } = await supa
  .from("careers")
  .select("id, dancer_id, title, type, created_at")
  .gte("created_at", CUTOFF)
  .in("dancer_id", sentIds)
  .order("created_at", { ascending: true });
if (e1) throw e1;

const byDancer = new Map();
for (const c of newCareers || []) {
  const arr = byDancer.get(c.dancer_id) || [];
  arr.push(c);
  byDancer.set(c.dancer_id, arr);
}

// 2) 해당 댄서 이름
const ids = [...byDancer.keys()];
let names = new Map();
if (ids.length) {
  const { data: ds } = await supa.from("dancers").select("id, stage_name, slug").in("id", ids);
  for (const d of ds || []) names.set(d.id, d);
}

console.log(`\n경력을 추가한 사람: ${byDancer.size}명, 추가된 경력 총 ${(newCareers || []).length}건\n`);
const rows = [...byDancer.entries()]
  .map(([id, cs]) => ({ d: names.get(id), n: cs.length, first: cs[0].created_at }))
  .sort((a, b) => b.n - a.n);
for (const r of rows) {
  const nm = r.d?.stage_name || "(이름?)";
  const sl = r.d?.slug ? ` /${r.d.slug}` : "";
  console.log(`  ${nm}${sl} — 경력 +${r.n}건 (첫 추가 ${new Date(r.first).toLocaleString("ko-KR")})`);
}

// 3) 보너스: 발송 후 사진/소개 변화는 careers와 별개라 dancers.* 갱신만으로는 추적 어려움 안내
console.log(`\n(참고: 위는 careers INSERT 기준. 사진/소개 수정은 별도 감사로그가 없어 이 집계엔 미포함.)`);

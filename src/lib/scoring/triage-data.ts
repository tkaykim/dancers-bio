import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeName, triageDancer, type TriageResult } from "./triage";

/**
 * 승인 대기 큐 트리아지 데이터 로더.
 *
 * 관리자 화면과 일괄 승인 액션이 **같은 함수**를 쓴다 —
 * 화면에 A로 보였는데 액션은 다르게 판정하는 사고를 원천 차단하기 위해서다.
 *
 * service-role 로 읽는 이유: 중복 탐지는 pending 뿐 아니라 승인된 댄서까지 전수 비교해야 하고,
 * careers/dancer_private_info 는 RLS 가 걸려 있어 집계가 조용히 비는 것을 피해야 한다.
 * (호출부는 반드시 is_admin 게이트를 통과한 뒤에만 부를 것.)
 */

export type TriageRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
  is_verified: boolean | null;
  profile_id: string | null;
  created_at: string;
  careerCount: number;
  hasPhone: boolean;
  triage: TriageResult;
  /** 연락처가 같은 상대 댄서 id */
  duplicateStrongOf: string[];
  /** 활동명만 같은 상대 댄서 id */
  duplicateWeakOf: string[];
};

export type TriageBuckets = {
  A: TriageRow[];
  B: TriageRow[];
  C: TriageRow[];
  REVIEW: TriageRow[];
  total: number;
};

const PAGE = 1000;

type DancerLite = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
  social_links: Record<string, unknown> | null;
  is_verified: boolean | null;
  profile_id: string | null;
  approval_status: string;
  is_active: boolean | null;
  created_at: string;
};

async function fetchAllDancers(): Promise<DancerLite[]> {
  const admin = createAdminClient();
  const all: DancerLite[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("dancers")
      .select(
        "id, stage_name, korean_name, slug, profile_img, genres, social_links, is_verified, profile_id, approval_status, is_active, created_at",
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`dancers fetch: ${error.message}`);
    const rows = (data ?? []) as DancerLite[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export type DuplicateSignal = {
  /** 연락처가 완전히 일치하는 상대 (거의 확실한 중복) */
  strong: string[];
  /** 정규화 활동명만 겹치는 상대 (동명이인 가능) */
  weak: string[];
};

/**
 * 중복 신호 맵 — 신호 강도를 분리한다.
 *
 * 실측(2026-08-14, pending 778명): 연락처 일치 26명 / 활동명만 일치 91명.
 * 연락처 일치는 표본을 열어보면 사실상 전부 진짜 중복이었고(같은 번호·같은 활동명),
 * 활동명만 겹치는 쪽은 "채원"·"Minseo"처럼 동명이인이 대부분이었다.
 * 그래서 강한 신호만 승인을 막고, 약한 신호는 배지로만 표시한다.
 */
function buildDuplicateMap(
  dancers: DancerLite[],
  phoneByDancer: Map<string, string>,
): Map<string, DuplicateSignal> {
  const byName = new Map<string, string[]>();
  const byPhone = new Map<string, string[]>();

  for (const d of dancers) {
    const n = normalizeName(d.stage_name) || normalizeName(d.korean_name);
    if (n.length >= 2) {
      byName.set(n, [...(byName.get(n) ?? []), d.id]);
    }
    const phone = phoneByDancer.get(d.id);
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 9) {
        byPhone.set(digits, [...(byPhone.get(digits) ?? []), d.id]);
      }
    }
  }

  const dup = new Map<string, DuplicateSignal>();
  const add = (id: string, others: string[], kind: keyof DuplicateSignal) => {
    const cur = dup.get(id) ?? { strong: [], weak: [] };
    cur[kind] = Array.from(
      new Set([...cur[kind], ...others.filter((o) => o !== id)]),
    );
    dup.set(id, cur);
  };
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    for (const id of group) add(id, group, "strong");
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const id of group) add(id, group, "weak");
  }
  return dup;
}

export async function loadTriageBuckets(): Promise<TriageBuckets> {
  const admin = createAdminClient();
  const dancers = await fetchAllDancers();

  // 경력 수 — dancer_id 별 집계 (전수, 페이지네이션)
  const careerCount = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("careers")
      .select("dancer_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`careers fetch: ${error.message}`);
    const rows = (data ?? []) as { dancer_id: string | null }[];
    for (const r of rows) {
      if (r.dancer_id) careerCount.set(r.dancer_id, (careerCount.get(r.dancer_id) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }

  // 연락처 — dancer_private_info.phone 우선, 없으면 계정 profiles.phone
  const phoneByDancer = new Map<string, string>();
  {
    const { data } = await admin
      .from("dancer_private_info")
      .select("dancer_id, phone")
      .not("phone", "is", null);
    for (const r of (data ?? []) as { dancer_id: string; phone: string }[]) {
      if (r.phone?.trim()) phoneByDancer.set(r.dancer_id, r.phone);
    }
    const { data: profs } = await admin
      .from("profiles")
      .select("id, phone")
      .not("phone", "is", null);
    const profPhone = new Map<string, string>();
    for (const p of (profs ?? []) as { id: string; phone: string }[]) {
      if (p.phone?.trim()) profPhone.set(p.id, p.phone);
    }
    for (const d of dancers) {
      if (!phoneByDancer.has(d.id) && d.profile_id) {
        const ph = profPhone.get(d.profile_id);
        if (ph) phoneByDancer.set(d.id, ph);
      }
    }
  }

  const dupMap = buildDuplicateMap(dancers, phoneByDancer);

  const buckets: TriageBuckets = { A: [], B: [], C: [], REVIEW: [], total: 0 };
  for (const d of dancers) {
    if (d.approval_status !== "pending") continue;
    if (d.is_active === false) continue; // 명시적 비활성은 큐에서 제외

    const dupSignal = dupMap.get(d.id) ?? { strong: [], weak: [] };
    const careers = careerCount.get(d.id) ?? 0;
    const row: TriageRow = {
      id: d.id,
      stage_name: d.stage_name,
      korean_name: d.korean_name,
      slug: d.slug,
      profile_img: d.profile_img,
      genres: d.genres,
      is_verified: d.is_verified,
      profile_id: d.profile_id,
      created_at: d.created_at,
      careerCount: careers,
      hasPhone: phoneByDancer.has(d.id),
      duplicateStrongOf: dupSignal.strong,
      duplicateWeakOf: dupSignal.weak,
      triage: triageDancer({
        stageName: d.stage_name,
        profileImg: d.profile_img,
        genres: d.genres,
        socialLinks: d.social_links,
        careerCount: careers,
        isVerified: d.is_verified,
        hasAccount: !!d.profile_id,
        duplicateStrong: dupSignal.strong.length > 0,
        duplicateWeak: dupSignal.weak.length > 0,
      }),
    };
    buckets[row.triage.tier].push(row);
    buckets.total += 1;
  }

  const byCareerDesc = (a: TriageRow, b: TriageRow) => b.careerCount - a.careerCount;
  buckets.A.sort(byCareerDesc);
  buckets.B.sort(byCareerDesc);
  buckets.C.sort(byCareerDesc);
  buckets.REVIEW.sort(byCareerDesc);

  return buckets;
}

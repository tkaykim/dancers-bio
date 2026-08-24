"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import type { ActionResult } from "@/app/actions/auth";

// 안무가가 이미 구두·SNS로 섭외를 끝낸 뒤 "정산만 기입"하는 경우를 위한 명단 조회.
// 캐스팅 제안→수락 루프를 거치지 않고 바로 정산 대상에 올리기 위한 후보를 준다.

export type RosterDancer = {
  id: string;
  stageName: string;
  koreanName: string | null;
  profileImg: string | null;
  location: string | null;
  /** 계정을 가진 댄서만 알림을 받을 수 있다. null이면 링크를 직접 전달해야 한다. */
  hasAccount: boolean;
  /** 함께한 프로젝트 수 (자주 함께한 순 정렬 근거) */
  workedCount: number;
  lastWorkedAt: string | null;
};

export type PastProject = {
  id: string;
  title: string;
  dancerCount: number;
  createdAt: string;
};

/**
 * 내가 **관리하는** 프로젝트 id 목록 (현재 프로젝트 제외).
 *
 * ⚠ `projects` RLS는 공개 공고 *열람*을 허용하므로 여기에 기대면 남의 프로젝트까지
 * 딸려온다. 소유자 + 공동관리자를 명시적으로 조회해야 한다(canManageProject와 동일 기준).
 */
async function myManagedProjectIds(
  userId: string,
  excludeProjectId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: owned }, { data: managed }] = await Promise.all([
    admin
      .from("projects")
      .select("id")
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("project_managers")
      .select("project_id")
      .eq("profile_id", userId)
      .limit(300),
  ]);

  const ids = new Set<string>();
  for (const p of (owned ?? []) as Array<{ id: string }>) ids.add(p.id);
  for (const m of (managed ?? []) as Array<{ project_id: string }>)
    ids.add(m.project_id);
  ids.delete(excludeProjectId);
  return [...ids];
}

/**
 * 이 안무가가 과거에 함께 정산했던 댄서를 빈도·최근순으로.
 * 별도 즐겨찾기 등록 없이 "자주 함께하는 댄서"를 자동으로 만든다.
 */
export async function frequentDancersAction(
  projectId: string,
): Promise<ActionResult<{ dancers: RosterDancer[] }>> {
  const user = await requireUser();
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const projectIds = await myManagedProjectIds(user.id, projectId);
  if (projectIds.length === 0) return { ok: true, data: { dancers: [] } };

  const admin = createAdminClient();
  // 과거 정산 이력 = 실제로 돈을 주고 함께 일한 사이. 지원만 하고 끝난 건은 제외한다.
  // 취소된 건과 금액이 안 정해진 건은 "함께 일했다"는 근거가 못 되므로 뺀다.
  const { data: rows } = await admin
    .from("settlements")
    .select("project_id, dancer_id, created_at, status")
    .in("project_id", projectIds)
    .neq("status", "cancelled")
    .not("gross_amount", "is", null)
    .gt("gross_amount", 0)
    .order("created_at", { ascending: false })
    .limit(1000);

  // 겸직(한 프로젝트에 role 여러 행)이 있어도 "함께 일한 횟수"는 프로젝트 단위 1회로 센다.
  const stat = new Map<string, { count: number; last: string }>();
  const seenPair = new Set<string>();
  for (const r of (rows ?? []) as Array<{
    project_id: string;
    dancer_id: string;
    created_at: string;
  }>) {
    const pairKey = `${r.project_id}:${r.dancer_id}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    const cur = stat.get(r.dancer_id);
    if (cur) cur.count += 1;
    else stat.set(r.dancer_id, { count: 1, last: r.created_at });
  }
  if (stat.size === 0) return { ok: true, data: { dancers: [] } };

  // 이미 이 프로젝트에 출연료(dancer) 행이 있는 댄서만 후보에서 뺀다.
  // 스태프·교통비 행만 있는 사람은 출연 명단 추가가 여전히 가능해야 한다(겸직).
  const { data: already } = await admin
    .from("settlements")
    .select("dancer_id")
    .eq("project_id", projectId)
    .eq("role", "dancer");
  for (const a of (already ?? []) as Array<{ dancer_id: string }>) {
    stat.delete(a.dancer_id);
  }

  const ids = [...stat.keys()];
  if (ids.length === 0) return { ok: true, data: { dancers: [] } };

  const { data: dRows } = await admin
    .from("dancers")
    .select("id, stage_name, korean_name, profile_img, location, profile_id")
    .in("id", ids);

  const dancers: RosterDancer[] = (dRows ?? [])
    .map((d) => {
      const s = stat.get(d.id as string)!;
      return {
        id: d.id as string,
        stageName: (d.stage_name as string) ?? "댄서",
        koreanName: (d.korean_name as string | null) ?? null,
        profileImg: (d.profile_img as string | null) ?? null,
        location: (d.location as string | null) ?? null,
        hasAccount: !!d.profile_id,
        workedCount: s.count,
        lastWorkedAt: s.last,
      };
    })
    .sort(
      (a, b) =>
        b.workedCount - a.workedCount ||
        (b.lastWorkedAt ?? "").localeCompare(a.lastWorkedAt ?? ""),
    )
    .slice(0, 24);

  return { ok: true, data: { dancers } };
}

/** 지난 프로젝트 목록 — 참여 명단을 통째로 불러오기 위한 선택지. */
export async function pastProjectsAction(
  projectId: string,
): Promise<ActionResult<{ projects: PastProject[] }>> {
  const user = await requireUser();
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const projectIds = await myManagedProjectIds(user.id, projectId);
  if (projectIds.length === 0) return { ok: true, data: { projects: [] } };

  const admin = createAdminClient();
  const [{ data: pRows }, { data: sRows }] = await Promise.all([
    admin
      .from("projects")
      .select("id, title, created_at")
      .in("id", projectIds)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("settlements")
      .select("project_id, dancer_id")
      .in("project_id", projectIds)
      .neq("status", "cancelled")
      .not("gross_amount", "is", null),
  ]);

  // 인원수 = 프로젝트별 고유 댄서 수 — 겸직으로 행이 여러 개여도 한 명으로 센다.
  const dancersByProject = new Map<string, Set<string>>();
  for (const s of (sRows ?? []) as Array<{
    project_id: string;
    dancer_id: string;
  }>) {
    const set = dancersByProject.get(s.project_id) ?? new Set<string>();
    set.add(s.dancer_id);
    dancersByProject.set(s.project_id, set);
  }
  const countByProject = new Map<string, number>();
  for (const [pid, set] of dancersByProject) countByProject.set(pid, set.size);

  const projects: PastProject[] = (pRows ?? [])
    .map((p) => ({
      id: p.id as string,
      title: (p.title as string) ?? "프로젝트",
      dancerCount: countByProject.get(p.id as string) ?? 0,
      createdAt: p.created_at as string,
    }))
    .filter((p) => p.dancerCount > 0)
    .slice(0, 12);

  return { ok: true, data: { projects } };
}

/** 지난 프로젝트의 참여 댄서 명단 (일괄 추가용). */
export async function projectRosterAction(
  projectId: string,
  sourceProjectId: string,
): Promise<ActionResult<{ dancers: RosterDancer[] }>> {
  await requireUser();
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };
  // 원본 프로젝트도 내가 관리하는 것이어야 명단을 볼 수 있다.
  if (!(await canManageProject(sourceProjectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  // 명단 복사는 출연(dancer) 행 기준 — 스태프·소개비 행은 출연 명단이 아니다.
  const [{ data: src }, { data: already }] = await Promise.all([
    admin
      .from("settlements")
      .select("dancer_id, created_at")
      .eq("project_id", sourceProjectId)
      .eq("role", "dancer")
      .neq("status", "cancelled"),
    admin
      .from("settlements")
      .select("dancer_id")
      .eq("project_id", projectId)
      .eq("role", "dancer"),
  ]);

  const skip = new Set(
    ((already ?? []) as Array<{ dancer_id: string }>).map((a) => a.dancer_id),
  );
  const ids = [
    ...new Set(
      ((src ?? []) as Array<{ dancer_id: string }>)
        .map((s) => s.dancer_id)
        .filter((id) => !skip.has(id)),
    ),
  ];
  if (ids.length === 0) return { ok: true, data: { dancers: [] } };

  const { data: dRows } = await admin
    .from("dancers")
    .select("id, stage_name, korean_name, profile_img, location, profile_id")
    .in("id", ids);

  const dancers: RosterDancer[] = (dRows ?? []).map((d) => ({
    id: d.id as string,
    stageName: (d.stage_name as string) ?? "댄서",
    koreanName: (d.korean_name as string | null) ?? null,
    profileImg: (d.profile_img as string | null) ?? null,
    location: (d.location as string | null) ?? null,
    hasAccount: !!d.profile_id,
    workedCount: 1,
    lastWorkedAt: null,
  }));

  return { ok: true, data: { dancers } };
}

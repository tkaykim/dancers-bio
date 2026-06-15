import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { RecommendedDancers } from "@/components/project/RecommendedDancers";
import { SearchAndPropose } from "@/components/project/SearchAndPropose";
import {
  ManagersPanel,
  type ProjectManager,
} from "@/components/project/ManagersPanel";
import {
  ApplicantsConsole,
  type ConsoleApplicant,
} from "@/components/project/ApplicantsConsole";
import { SchedulePanel, type ScheduleRow } from "@/components/project/SchedulePanel";
import {
  SettlementPanel,
  type SettlementApplicant,
} from "@/components/project/SettlementPanel";
import type { SettlementStatus } from "@/lib/settlement";
import { formatWhen } from "@/lib/format-when";
import { classifyProjectIdentifier } from "@/lib/projectId";

type Application = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  rejection_reason: string | null;
  applicant: { id: string; display_name: string; avatar_url: string | null } | null;
  dancer:
    | {
        id: string;
        stage_name: string;
        korean_name: string | null;
        slug: string | null;
        profile_img: string | null;
        genres: string[] | null;
        location: string | null;
      }
    | null;
  team: { id: string; team_name: string; slug: string | null; profile_img: string | null } | null;
};

type Project = {
  id: string;
  short_code: string;
  owner_id: string;
  title: string;
  recruitment_count: number;
  schedule_survey_code: string;
};

type RecommendedDancer = {
  dancer_id: string;
  stage_name: string;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
  location: string | null;
  profile_id: string | null;
  genre_match: boolean;
  location_match: boolean;
};

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) notFound();

  const user = await requireUser();
  const supabase = await createClient();

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = !!viewerProfile?.is_admin;

  const projectQuery = supabase
    .from("projects")
    .select(
      "id, short_code, owner_id, title, recruitment_count, schedule_survey_code",
    )
    .is("deleted_at", null);

  const { data: project } = await (
    identifier.kind === "uuid"
      ? projectQuery.eq("id", identifier.value)
      : projectQuery.eq("short_code", identifier.value)
  ).maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  // 소유자·슈퍼관리자·공동관리자만 접근.
  if (!(await canManageProject(p.id))) notFound();
  const canEditManagers = isAdmin || p.owner_id === user.id;

  // 공동관리자 명단 (profile_id FK 기준 임베드 — added_by와 구분 필요).
  const { data: mgrRows } = await supabase
    .from("project_managers")
    .select(
      "profile_id, created_at, profile:profiles!project_managers_profile_id_fkey ( display_name, avatar_url, instagram_handle )",
    )
    .eq("project_id", p.id)
    .order("created_at");
  type ProfileLite = {
    display_name: string | null;
    avatar_url: string | null;
    instagram_handle: string | null;
  };
  type MgrRow = { profile_id: string; profile: ProfileLite | ProfileLite[] | null };
  const managers: ProjectManager[] = (
    (mgrRows ?? []) as unknown as MgrRow[]
  ).map((r) => {
    const prof = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    return {
      profile_id: r.profile_id,
      display_name: prof?.display_name ?? "(이름 없음)",
      avatar_url: prof?.avatar_url ?? null,
      instagram_handle: prof?.instagram_handle ?? null,
    };
  });

  // 추천 댄서 — 매칭 RPC(SECURITY DEFINER). 소유자/admin이 아니면 빈 배열 반환.
  const { data: matchData } = await supabase.rpc("match_dancers_for_project", {
    p_id: p.id,
    _limit: 12,
  });
  const recommended = (matchData ?? []) as RecommendedDancer[];

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, rejection_reason,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img, genres, location ),
       team:teams!applications_team_id_fkey ( id, team_name, slug, profile_img )`,
    )
    .eq("project_id", p.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Application[];

  const applicants: ConsoleApplicant[] = list.map((a) => {
    const isTeam = !!a.team;
    const name = isTeam
      ? a.team?.team_name ?? "(팀)"
      : a.dancer
        ? a.dancer.stage_name
        : a.applicant?.display_name ?? "(알 수 없음)";
    const avatar = isTeam
      ? a.team?.profile_img ?? null
      : a.dancer?.profile_img ?? a.applicant?.avatar_url ?? null;
    const publicHref = isTeam
      ? `/t/${a.team?.slug ?? a.team?.id}`
      : a.dancer
        ? `/d/${a.dancer.slug ?? a.dancer.id}`
        : a.applicant?.id
          ? `/u/${a.applicant.id}`
          : null;
    return {
      id: a.id,
      status: a.status,
      source: a.source,
      cover_message: a.cover_message,
      created_at: a.created_at,
      isTeam,
      name,
      korean_name: isTeam ? null : a.dancer?.korean_name ?? null,
      avatar,
      publicHref,
      dancerId: a.dancer?.id ?? null,
      genres: (a.dancer?.genres ?? []) as string[],
      location: a.dancer?.location ?? null,
      rejection_reason: a.rejection_reason ?? null,
    };
  });

  // 일정 가능여부 — 후보 일정 + 응답 집계
  const targetCount = applicants.filter(
    (a) => a.status === "pending" || a.status === "accepted",
  ).length;
  const { data: schedRows } = await supabase
    .from("project_schedules")
    .select("id, label, starts_at, ends_at, location")
    .eq("project_id", p.id)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const schedList = (schedRows ?? []) as Array<{
    id: string;
    label: string;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
  }>;
  const respCounts: Record<
    string,
    { available: number; partial: number; unavailable: number; responded: number }
  > = {};
  if (schedList.length > 0) {
    const { data: resp } = await supabase
      .from("project_schedule_responses")
      .select("schedule_id, status")
      .in(
        "schedule_id",
        schedList.map((s) => s.id),
      );
    for (const r of (resp ?? []) as { schedule_id: string; status: string }[]) {
      const x = (respCounts[r.schedule_id] ??= {
        available: 0,
        partial: 0,
        unavailable: 0,
        responded: 0,
      });
      x.responded++;
      if (r.status === "available") x.available++;
      else if (r.status === "partial") x.partial++;
      else if (r.status === "unavailable") x.unavailable++;
    }
  }
  const scheduleRows: ScheduleRow[] = schedList.map((s) => {
    const c = respCounts[s.id] ?? {
      available: 0,
      partial: 0,
      unavailable: 0,
      responded: 0,
    };
    return {
      id: s.id,
      label: s.label,
      whenText: formatWhen(s.starts_at, s.ends_at),
      location: s.location ?? null,
      ...c,
    };
  });

  // 정산 — 합격(수락) 댄서 + 기존 정산금액/상태
  const { data: settleRows } = await supabase
    .from("settlements")
    .select("dancer_id, gross_amount, status")
    .eq("project_id", p.id);
  const settleByDancer = new Map<
    string,
    { gross_amount: number; status: SettlementStatus }
  >();
  for (const r of (settleRows ?? []) as Array<{
    dancer_id: string;
    gross_amount: number;
    status: SettlementStatus;
  }>) {
    settleByDancer.set(r.dancer_id, {
      gross_amount: r.gross_amount,
      status: r.status,
    });
  }
  const seenSettle = new Set<string>();
  const settlementApplicants: SettlementApplicant[] = applicants
    .filter((a) => a.status === "accepted" && a.dancerId && !a.isTeam)
    .filter((a) => {
      if (seenSettle.has(a.dancerId!)) return false;
      seenSettle.add(a.dancerId!);
      return true;
    })
    .map((a) => {
      const s = settleByDancer.get(a.dancerId!);
      return {
        dancerId: a.dancerId!,
        name: a.name,
        grossAmount: s?.gross_amount ?? null,
        status: s?.status ?? null,
      };
    });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <Link
        href={`/projects/${p.short_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트
      </Link>

      <h1 className="text-xl font-bold leading-tight tracking-tight">
        {p.title}
      </h1>

      {/* 본업: 지원자 심사 콘솔 (최상단) */}
      <ApplicantsConsole
        projectId={p.id}
        recruitmentCount={p.recruitment_count}
        initial={applicants}
      />

      <SchedulePanel
        projectId={p.id}
        targetCount={targetCount}
        schedules={scheduleRows}
        surveyUrl={`https://deetz.kr/sr/${p.schedule_survey_code}`}
      />

      <SettlementPanel projectId={p.id} applicants={settlementApplicants} />

      {/* 세팅·초대 도구: 접힘 (본업을 가리지 않도록 아래로) */}
      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          <span>지원자 초대 · 공동관리자</span>
          <span className="text-ink-3 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-5 border-t border-hairline-2 p-4">
          <ManagersPanel
            projectId={p.id}
            canEdit={canEditManagers}
            managers={managers}
          />
          {recommended.length > 0 ? (
            <RecommendedDancers projectId={p.id} dancers={recommended} />
          ) : null}
          <SearchAndPropose projectId={p.id} />
        </div>
      </details>
    </div>
  );
}

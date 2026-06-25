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
import {
  RecruitmentChannelsPanel,
  type RecruitmentChannel,
} from "@/components/project/RecruitmentChannelsPanel";
import {
  ProjectEventsPanel,
  type ProjectEventRow,
} from "@/components/project/ProjectEventsPanel";
import { SchedulePanel, type ScheduleRow } from "@/components/project/SchedulePanel";
import {
  AnnouncementsPanel,
  type AnnouncementRow,
} from "@/components/project/AnnouncementsPanel";
import { WithdrawalLinkPanel } from "@/components/project/WithdrawalLinkPanel";
import { formatWhen } from "@/lib/format-when";
import { classifyProjectIdentifier } from "@/lib/projectId";

type Application = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  rejection_reason: string | null;
  recruitment_channel_id: string | null;
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
  settlement_share_code: string;
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

type RecruitmentChannelRow = {
  id: string;
  name: string;
  share_code: string;
  legacy_project_id: string | null;
  channel_type: string;
  status: string;
  manager_label: string | null;
};

type RecruitmentChannelMemberRow = {
  channel_id: string;
  profile_id: string;
  role: string;
  can_view_applicants: boolean | null;
  can_decide_applications: boolean | null;
  profile:
    | {
        display_name: string | null;
        avatar_url: string | null;
        instagram_handle: string | null;
      }
    | Array<{
        display_name: string | null;
        avatar_url: string | null;
        instagram_handle: string | null;
      }>
    | null;
};

type ProjectEventDbRow = {
  id: string;
  name: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: string;
  ops_code: string;
  public_pass_code: string;
};

type EventParticipantLite = {
  event_id: string;
  attendance_status: string;
  onsite_status: string;
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
      "id, short_code, owner_id, title, recruitment_count, schedule_survey_code, settlement_share_code",
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

  const { data: channelRowsRaw } = await supabase
    .from("recruitment_channels")
    .select("id, name, share_code, legacy_project_id, channel_type, status, manager_label")
    .eq("project_id", p.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const channelRows = (channelRowsRaw ?? []) as RecruitmentChannelRow[];
  const applicationProjectIds = Array.from(
    new Set([
      p.id,
      ...channelRows
        .map((channel) => channel.legacy_project_id)
        .filter((id): id is string => !!id),
    ]),
  );
  const channelIds = channelRows.map((ch) => ch.id);
  const { data: channelMemberRowsRaw } =
    channelIds.length > 0
      ? await supabase
          .from("recruitment_channel_members")
          .select(
            "channel_id, profile_id, role, can_view_applicants, can_decide_applications, profile:profiles!recruitment_channel_members_profile_id_fkey ( display_name, avatar_url, instagram_handle )",
          )
          .in("channel_id", channelIds)
          .order("created_at", { ascending: true })
      : { data: [] };
  const channelMembersById = new Map<
    string,
    RecruitmentChannel["members"]
  >();
  for (const row of (channelMemberRowsRaw ?? []) as unknown as RecruitmentChannelMemberRow[]) {
    const profile = Array.isArray(row.profile)
      ? row.profile[0] ?? null
      : row.profile;
    const list = channelMembersById.get(row.channel_id) ?? [];
    list.push({
      profile_id: row.profile_id,
      role: row.role,
      display_name: profile?.display_name ?? "(이름 없음)",
      avatar_url: profile?.avatar_url ?? null,
      instagram_handle: profile?.instagram_handle ?? null,
      can_view_applicants: row.can_view_applicants ?? true,
      can_decide_applications: row.can_decide_applications ?? false,
    });
    channelMembersById.set(row.channel_id, list);
  }

  // 추천 댄서 — 매칭 RPC(SECURITY DEFINER). 소유자/admin이 아니면 빈 배열 반환.
  const { data: matchData } = await supabase.rpc("match_dancers_for_project", {
    p_id: p.id,
    _limit: 12,
  });
  const recommended = (matchData ?? []) as RecommendedDancer[];

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, rejection_reason, recruitment_channel_id,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img, genres, location ),
       team:teams!applications_team_id_fkey ( id, team_name, slug, profile_img )`,
    )
    .in("project_id", applicationProjectIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Application[];
  const channelById = new Map(channelRows.map((ch) => [ch.id, ch]));
  const channelStats = new Map<
    string,
    { applicantCount: number; acceptedCount: number; pendingCount: number }
  >();
  for (const app of list) {
    if (!app.recruitment_channel_id) continue;
    const stats = channelStats.get(app.recruitment_channel_id) ?? {
      applicantCount: 0,
      acceptedCount: 0,
      pendingCount: 0,
    };
    stats.applicantCount++;
    if (app.status === "accepted") stats.acceptedCount++;
    if (app.status === "pending") stats.pendingCount++;
    channelStats.set(app.recruitment_channel_id, stats);
  }

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
      recruitmentChannelId: a.recruitment_channel_id ?? null,
      recruitmentChannelName: a.recruitment_channel_id
        ? channelById.get(a.recruitment_channel_id)?.name ?? null
        : null,
    };
  });
  const recruitmentChannels: RecruitmentChannel[] = channelRows.map((channel) => {
    const stats = channelStats.get(channel.id) ?? {
      applicantCount: 0,
      acceptedCount: 0,
      pendingCount: 0,
    };
    return {
      ...channel,
      ...stats,
      members: channelMembersById.get(channel.id) ?? [],
    };
  });

  // 일정 가능여부 — 후보 일정 + 응답 집계
  const targetCount = applicants.filter(
    (a) => a.status === "pending" || a.status === "accepted",
  ).length;
  const { data: schedRows } = await supabase
    .from("project_schedules")
    .select(
      "id, label, starts_at, ends_at, location, time_tbd, status, project_event_id",
    )
    .eq("project_id", p.id)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const schedList = (schedRows ?? []) as Array<{
    id: string;
    label: string;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    time_tbd: boolean;
    status: string;
    project_event_id: string | null;
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
  const { data: eventRowsRaw } = await supabase
    .from("project_events")
    .select(
      "id, name, event_type, starts_at, ends_at, location, status, ops_code, public_pass_code",
    )
    .eq("project_id", p.id)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const eventRows = (eventRowsRaw ?? []) as ProjectEventDbRow[];
  const eventIds = eventRows.map((event) => event.id);
  const { data: eventParticipantRowsRaw } =
    eventIds.length > 0
      ? await supabase
          .from("event_participants")
          .select("event_id, attendance_status, onsite_status")
          .in("event_id", eventIds)
      : { data: [] };
  const eventStats = new Map<
    string,
    { participantCount: number; checkedInCount: number; finalistCount: number }
  >();
  for (const row of (eventParticipantRowsRaw ?? []) as EventParticipantLite[]) {
    const stats = eventStats.get(row.event_id) ?? {
      participantCount: 0,
      checkedInCount: 0,
      finalistCount: 0,
    };
    stats.participantCount++;
    if (row.attendance_status === "checked_in") stats.checkedInCount++;
    if (row.onsite_status === "finalist" || row.onsite_status === "hold") {
      stats.finalistCount++;
    }
    eventStats.set(row.event_id, stats);
  }
  const projectEvents: ProjectEventRow[] = eventRows.map((event) => {
    const stats = eventStats.get(event.id) ?? {
      participantCount: 0,
      checkedInCount: 0,
      finalistCount: 0,
    };
    return { ...event, ...stats };
  });
  const eventById = new Map(projectEvents.map((event) => [event.id, event]));

  // 일정 → 연결된 운영보드 정보 병합 (있으면 출석/참가자 카운트 + ops_code).
  const scheduleRows: ScheduleRow[] = schedList.map((s) => {
    const c = respCounts[s.id] ?? {
      available: 0,
      partial: 0,
      unavailable: 0,
      responded: 0,
    };
    const board = s.project_event_id
      ? eventById.get(s.project_event_id) ?? null
      : null;
    return {
      id: s.id,
      label: s.label,
      whenText: formatWhen(s.starts_at, s.ends_at, s.time_tbd),
      location: s.location ?? null,
      status: s.status,
      boardOpsCode: board?.ops_code ?? null,
      boardParticipants: board?.participantCount ?? 0,
      boardCheckedIn: board?.checkedInCount ?? 0,
      ...c,
    };
  });

  // 일정에 연결된 보드는 일정 카드에서 다루므로, 독립 보드만 ProjectEventsPanel로.
  const linkedEventIds = new Set(
    schedList
      .map((s) => s.project_event_id)
      .filter((id): id is string => !!id),
  );
  const standaloneEvents = projectEvents.filter(
    (event) => !linkedEventIds.has(event.id),
  );

  // 공지사항 (관리자는 RLS pa_manage 로 전체 조회)
  const { data: annRows } = await supabase
    .from("project_announcements")
    .select("id, title, body, audiences, pinned, created_at")
    .eq("project_id", p.id)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const announcements = (annRows ?? []) as AnnouncementRow[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8 lg:max-w-6xl">
      <Link
        href={`/projects/${p.short_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트
      </Link>

      <h1 className="text-xl font-bold leading-tight tracking-tight">
        {p.title}
      </h1>

      {/*
        PC(lg+) = 2컬럼 운영 대시보드: 좌 = 지원자 심사(메인) / 우 = 운영 도구 사이드바.
        모바일 = grid-cols-1 이라 소스 순서 그대로 단일 스택(콘솔 → 공지 → 일정 → 보드 → 출금 → 초대도구), 현행과 동일.
      */}
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        {/* 본업: 지원자 심사 콘솔 */}
        <div className="flex min-w-0 flex-col gap-5">
          <ApplicantsConsole
            projectId={p.id}
            recruitmentCount={p.recruitment_count}
            initial={applicants}
            channels={recruitmentChannels.map((channel) => ({
              id: channel.id,
              name: channel.name,
            }))}
          />
        </div>

        {/* 운영 도구 사이드바 (모바일에선 콘솔 아래로 자연 스택) */}
        <div className="flex min-w-0 flex-col gap-5">
          <AnnouncementsPanel
            projectId={p.id}
            shortCode={p.short_code}
            announcements={announcements}
          />

          <SchedulePanel
            projectId={p.id}
            targetCount={targetCount}
            schedules={scheduleRows}
            surveyUrl={`https://deetz.kr/sr/${p.schedule_survey_code}`}
          />

          <ProjectEventsPanel events={standaloneEvents} />

          <WithdrawalLinkPanel
            url={`https://deetz.kr/w/${p.settlement_share_code}`}
          />

          {/* 세팅·초대 도구: 접힘 */}
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
              <RecruitmentChannelsPanel
                projectId={p.id}
                canEdit={true}
                channels={recruitmentChannels}
              />
              {recommended.length > 0 ? (
                <RecommendedDancers projectId={p.id} dancers={recommended} />
              ) : null}
              <SearchAndPropose projectId={p.id} />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

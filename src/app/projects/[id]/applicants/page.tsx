import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { FitSizePanel, type FitRow } from "@/components/project/FitSizePanel";
import { makeCastingReviewToken, makeHeightToken } from "@/lib/quick-token";
import {
  applicationMatchesCandidateStatuses,
  normalizeCandidateStatuses,
  type ClientDecision,
} from "@/lib/casting/review";
import {
  CastingBoardPanel,
  type CastingBoardInfo,
} from "@/components/casting/CastingBoardPanel";
import { formatWhen } from "@/lib/format-when";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { GRIGO_SETTLE_ORIGIN } from "@/lib/brand";

type Application = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  rejection_reason: string | null;
  recruitment_channel_id: string | null;
  dancer_id: string | null;
  proposed_fee: number | null;
  proposed_fee_currency: string | null;
  proposed_fee_unit: string | null;
  fee_status: string | null;
  applicant_name: string | null;
  birth_year: number | null;
  height_cm: number | null;
  primary_genre: string | null;
  dance_video_url: string | null;
  backup_dancer_history: string | null;
  personal_profile_url: string | null;
  confirmed_at: string | null;
  passed_round: number | null;
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
        gender: string | null;
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
  selection_rounds: number | null;
  round_labels: string[] | null;
  schedule_survey_code: string;
  settlement_share_code: string;
  size_share_code: string | null;
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
      "id, short_code, owner_id, title, recruitment_count, selection_rounds, round_labels, schedule_survey_code, settlement_share_code, size_share_code",
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

  // 클라이언트 캐스팅 보드 (가장 최근 1개) + 멤버 수.
  let castingBoard: CastingBoardInfo | null = null;
  {
    const { data: cb } = await supabase
      .from("casting_boards")
      .select(
        "id, share_code, settings, is_active, expires_at, review_token_version, review_submitted_at, review_submitted_by",
      )
      .eq("project_id", p.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cb) {
      const [{ data: memberRows }, { data: sendRows }, { data: commentRows }] = await Promise.all([
        supabase
          .from("casting_board_members")
          .select("id, application_id, client_decision")
          .eq("board_id", cb.id as string),
        supabase
          .from("casting_board_sends")
          .select("recipient_email, recipient_name, sent_at")
          .eq("board_id", cb.id as string)
          .order("sent_at", { ascending: false })
          .limit(10),
        supabase
          .from("casting_board_comments")
          .select("id, author_name, body, is_read, created_at")
          .eq("board_id", cb.id as string)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const settings = (cb.settings ?? {}) as CastingBoardInfo["settings"];
      const rawMemberRows = (memberRows ?? []) as Array<{
        id: string;
        application_id: string | null;
        client_decision: ClientDecision | null;
      }>;
      let visibleMemberRows = rawMemberRows;
      if (settings.clientReview?.enabled) {
        const applicationIds = rawMemberRows
          .map((row) => row.application_id)
          .filter((id): id is string => Boolean(id));
        const { data: boardApplicationRows } = applicationIds.length
          ? await supabase
              .from("applications")
              .select("id, status, confirmed_at")
              .eq("project_id", p.id)
              .in("id", applicationIds)
              .is("archived_at", null)
          : { data: [] };
        const applicationById = new Map(
          ((boardApplicationRows ?? []) as Array<{
            id: string;
            status: string;
            confirmed_at: string | null;
          }>).map((application) => [application.id, application]),
        );
        const candidateStatuses = normalizeCandidateStatuses(
          settings.clientReview.candidateStatuses,
        );
        visibleMemberRows = rawMemberRows.filter((row) => {
          if (!row.application_id) return true;
          const application = applicationById.get(row.application_id);
          return Boolean(
            application &&
              applicationMatchesCandidateStatuses(
                {
                  status: application.status,
                  confirmedAt: application.confirmed_at,
                },
                candidateStatuses,
              ),
          );
        });
      }
      const decisionCounts: Record<ClientDecision, number> = {
        undecided: 0,
        selected: 0,
        hold: 0,
        excluded: 0,
      };
      for (const row of visibleMemberRows) {
        decisionCounts[row.client_decision ?? "undecided"] += 1;
      }
      const reviewToken = makeCastingReviewToken(
        cb.id as string,
        Number(cb.review_token_version ?? 1),
      );
      castingBoard = {
        id: cb.id as string,
        shareCode: cb.share_code as string,
        settings,
        memberCount: visibleMemberRows.length,
        reviewUrl: `https://deetz.kr/review/${reviewToken}`,
        isActive: cb.is_active !== false,
        expiresAt: (cb.expires_at as string | null) ?? null,
        reviewSubmittedAt: (cb.review_submitted_at as string | null) ?? null,
        reviewSubmittedBy: (cb.review_submitted_by as string | null) ?? null,
        decisionCounts,
        sends: ((sendRows ?? []) as Array<{
          recipient_email: string;
          recipient_name: string | null;
          sent_at: string;
        }>).map((s) => ({
          email: s.recipient_email,
          name: s.recipient_name,
          sentAt: s.sent_at,
        })),
        comments: ((commentRows ?? []) as Array<{
          id: string;
          author_name: string | null;
          body: string;
          is_read: boolean;
          created_at: string;
        }>).map((c) => ({
          id: c.id,
          authorName: c.author_name,
          body: c.body,
          isRead: c.is_read,
          createdAt: c.created_at,
        })),
      };
    }
  }

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
      `id, status, source, cover_message, created_at, rejection_reason, recruitment_channel_id, dancer_id,
       proposed_fee, proposed_fee_currency, proposed_fee_unit, fee_status, confirmed_at, passed_round,
       applicant_name, birth_year, height_cm, primary_genre, dance_video_url,
       backup_dancer_history, personal_profile_url,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img, genres, location, gender ),
       team:teams!applications_team_id_fkey ( id, team_name, slug, profile_img )`,
    )
    .in("project_id", applicationProjectIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Application[];

  // 지원자 댄서 상세 + 키(height_cm) + 의상 사이즈 — service-role로 조회.
  // 이유: 지원자 댄서는 approval_status=pending이 많고, dancers RLS(dancers_select_public)는
  // 공동관리자(비-admin)에게 미승인 댄서를 숨긴다. RLS 임베드(a.dancer)로는 공동관리자 화면에서
  // 이름·사진·장르·키가 전부 비고, dancerId도 null이 돼 상세 시트조차 안 뜬다.
  // 이 페이지는 canManageProject를 이미 통과했으므로 지원자 댄서 공개필드를 service-role로 직접 읽어
  // 승인 여부와 무관하게 매니저에게 노출한다. (dancer_private_info도 원래 admin/owner만 RLS 허용)
  const dancerIds = Array.from(
    new Set(list.map((a) => a.dancer_id).filter((id): id is string => !!id)),
  );
  type DancerLite = {
    id: string;
    stage_name: string;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
    genres: string[] | null;
    location: string | null;
    gender: string | null;
  };
  const dancerById = new Map<string, DancerLite>();
  const heightByDancer = new Map<string, number>();
  const sizeByDancer = new Map<
    string,
    { top: string | null; waist: string | null; length: string | null }
  >();
  if (dancerIds.length > 0) {
    const admin = createAdminClient();
    const [{ data: dRows }, { data: privRows }] = await Promise.all([
      admin
        .from("dancers")
        .select(
          "id, stage_name, korean_name, slug, profile_img, genres, location, gender",
        )
        .in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select(
          "dancer_id, height_cm, top_size, pants_waist_inch, pants_length_cm",
        )
        .in("dancer_id", dancerIds),
    ]);
    for (const d of (dRows ?? []) as DancerLite[]) dancerById.set(d.id, d);
    for (const h of (privRows ?? []) as Array<{
      dancer_id: string;
      height_cm: number | null;
      top_size: string | null;
      pants_waist_inch: string | null;
      pants_length_cm: string | null;
    }>) {
      if (h.height_cm != null) heightByDancer.set(h.dancer_id, h.height_cm);
      sizeByDancer.set(h.dancer_id, {
        top: h.top_size,
        waist: h.pants_waist_inch,
        length: h.pants_length_cm,
      });
    }
  }

  // 사전선별 평가 집계 — 지원별 평균/건수 + 내 점수. (RLS: 담당자만 조회 가능)
  const evalAgg = new Map<
    string,
    { sum: number; count: number; myScore: number | null }
  >();
  if (list.length > 0) {
    // 지원자 수가 많은 프로젝트(수백 건)에서도 안전하도록 application_id 나열 대신
    // 임베드 조인으로 project_id 기준 필터링한다. (RLS가 담당 프로젝트로 추가 제한)
    const { data: evalRows, error: evalErr } = await supabase
      .from("application_evaluations")
      .select("application_id, evaluator_id, score, app:applications!inner(project_id)")
      .eq("stage", "prescreen")
      .in("app.project_id", applicationProjectIds);
    if (evalErr) console.error("[applicants] 평가 집계 조회 실패:", evalErr.message);
    for (const ev of (evalRows ?? []) as Array<{
      application_id: string;
      evaluator_id: string;
      score: number;
    }>) {
      const agg = evalAgg.get(ev.application_id) ?? {
        sum: 0,
        count: 0,
        myScore: null,
      };
      agg.sum += ev.score;
      agg.count += 1;
      if (ev.evaluator_id === user.id) agg.myScore = ev.score;
      evalAgg.set(ev.application_id, agg);
    }
  }

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

  // 결과 안내 발송 이력 — 벌크 반영·일괄 거절처럼 메일 없이 상태만 바뀐 경우를
  // 콘솔에서 "미발송"으로 드러내기 위한 조회. 채널 = stage_r{n} / stage_reject.
  const { data: stageNoticeRows } = await createAdminClient()
    .from("project_notification_log")
    .select("recipient_id, channel")
    .eq("project_id", p.id)
    .or("channel.like.stage_r%,channel.eq.stage_reject");
  const stageNoticeSet = new Set(
    ((stageNoticeRows ?? []) as Array<{ recipient_id: string; channel: string }>).map(
      (r) => `${r.recipient_id}|${r.channel}`,
    ),
  );

  const applicants: ConsoleApplicant[] = list.map((a) => {
    const isTeam = !!a.team;
    // RLS 임베드(a.dancer)는 미승인 댄서를 공동관리자에게 숨기므로, service-role로 읽은
    // dancerById를 우선 사용한다(승인 댄서는 임베드와 동일한 값이라 결과 불변).
    const dancer =
      a.dancer ?? (a.dancer_id ? dancerById.get(a.dancer_id) ?? null : null);
    const name = isTeam
      ? a.team?.team_name ?? "(팀)"
      : dancer
        ? dancer.stage_name
        : a.applicant?.display_name ?? "(알 수 없음)";
    const avatar = isTeam
      ? a.team?.profile_img ?? null
      : dancer?.profile_img ?? a.applicant?.avatar_url ?? null;
    const publicHref = isTeam
      ? `/t/${a.team?.slug ?? a.team?.id}`
      : dancer
        ? `/d/${dancer.slug ?? dancer.id}`
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
      korean_name: isTeam ? null : dancer?.korean_name ?? null,
      avatar,
      publicHref,
      dancerId: dancer?.id ?? a.dancer_id ?? null,
      gender: isTeam ? null : dancer?.gender ?? null,
      heightCm: dancer?.id ? heightByDancer.get(dancer.id) ?? null : null,
      genres: (dancer?.genres ?? []) as string[],
      location: dancer?.location ?? null,
      rejection_reason: a.rejection_reason ?? null,
      recruitmentChannelId: a.recruitment_channel_id ?? null,
      recruitmentChannelName: a.recruitment_channel_id
        ? channelById.get(a.recruitment_channel_id)?.name ?? null
        : null,
      proposed_fee: a.proposed_fee ?? null,
      proposed_fee_currency: a.proposed_fee_currency ?? null,
      proposed_fee_unit: a.proposed_fee_unit ?? null,
      fee_status: a.fee_status ?? null,
      castingDetails: {
        applicant_name: a.applicant_name ?? null,
        birth_year: a.birth_year ?? null,
        height_cm: a.height_cm ?? null,
        primary_genre: a.primary_genre ?? null,
        dance_video_url: a.dance_video_url ?? null,
        backup_dancer_history: a.backup_dancer_history ?? null,
        personal_profile_url: a.personal_profile_url ?? null,
      },
      confirmedAt: a.confirmed_at ?? null,
      passedRound: a.passed_round ?? 0,
      // 본인 포기(declined)는 스스로 빠진 것이라 안내 대상이 아니다.
      noticeSent:
        !a.applicant?.id ||
        (a.status !== "accepted" && a.status !== "rejected") ||
        stageNoticeSet.has(
          a.status === "accepted"
            ? `${a.applicant.id}|stage_r${Math.max(a.passed_round ?? 0, 1)}`
            : `${a.applicant.id}|stage_reject`,
        ),
      evalCount: evalAgg.get(a.id)?.count ?? 0,
      avgScore:
        (evalAgg.get(a.id)?.count ?? 0) > 0
          ? evalAgg.get(a.id)!.sum / evalAgg.get(a.id)!.count
          : null,
      myScore: evalAgg.get(a.id)?.myScore ?? null,
    };
  });
  // 의상 사이즈 현황 — 확정자(confirmed_at) 대상. 개인 /fit 링크 + 제출값.
  const fitRows: FitRow[] = applicants
    .filter((a) => a.confirmedAt && a.dancerId && !a.isTeam)
    .map((a) => {
      const s = sizeByDancer.get(a.dancerId!) ?? {
        top: null,
        waist: null,
        length: null,
      };
      return {
        name: a.name,
        link: `https://deetz.kr/fit/${makeHeightToken(a.dancerId!)}`,
        top: s.top,
        waist: s.waist,
        length: s.length,
        submitted: !!(s.top && s.waist && s.length),
      };
    })
    .sort(
      (x, y) =>
        Number(x.submitted) - Number(y.submitted) ||
        x.name.localeCompare(y.name),
    );

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
    .select(
      "id, title, body, audiences, pinned, created_at, email_sent_at, email_sent_count",
    )
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
            selectionRounds={p.selection_rounds ?? 2}
            roundLabels={p.round_labels ?? null}
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
            selectionRounds={p.selection_rounds ?? 2}
            roundLabels={p.round_labels ?? null}
          />

          <SchedulePanel
            projectId={p.id}
            targetCount={targetCount}
            schedules={scheduleRows}
            surveyUrl={`https://deetz.kr/sr/${p.schedule_survey_code}`}
          />

          {fitRows.length > 0 ? (
            <FitSizePanel
              rows={fitRows}
              shareUrl={`https://deetz.kr/fr/${p.short_code}`}
              sizesHref={`/projects/${p.short_code}/sizes`}
              publicSummaryUrl={
                p.size_share_code
                  ? `https://deetz.kr/sz/${p.size_share_code}`
                  : undefined
              }
            />
          ) : null}

          <CastingBoardPanel projectId={p.id} board={castingBoard} />

          <ProjectEventsPanel events={standaloneEvents} />

          <WithdrawalLinkPanel
            url={`https://deetz.kr/w/${p.settlement_share_code}`}
            grigoUrl={`${GRIGO_SETTLE_ORIGIN}/w/${p.settlement_share_code}`}
          />

          <Link
            href={`/projects/${p.id}/settlements`}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold active:bg-secondary"
          >
            <span>정산 관리 · 수집 링크</span>
            <span className="text-ink-3">→</span>
          </Link>

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

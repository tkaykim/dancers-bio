import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApplicantsConsole,
  type ConsoleApplicant,
} from "@/components/project/ApplicantsConsole";

type ChannelRow = {
  id: string;
  project_id: string;
  name: string;
  share_code: string;
  status: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  rejection_reason: string | null;
  recruitment_channel_id: string | null;
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
  applicant:
    | { id: string; display_name: string; avatar_url: string | null }
    | null;
};

export default async function ChannelApplicantsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireUser();
  const { code } = await params;
  const shareCode = (code ?? "").trim();
  if (!shareCode) notFound();

  const supabase = await createClient();
  const { data: channelData } = await supabase
    .from("recruitment_channels")
    .select("id, project_id, name, share_code, status")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (!channelData) notFound();
  const channel = channelData as ChannelRow;

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("title, short_code, recruitment_count, selection_rounds, round_labels")
    .eq("id", channel.project_id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, rejection_reason, recruitment_channel_id,
       proposed_fee, proposed_fee_currency, proposed_fee_unit, fee_status, confirmed_at, passed_round,
       applicant_name, birth_year, height_cm, primary_genre, dance_video_url,
       backup_dancer_history, personal_profile_url,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img, genres, location, gender )`,
    )
    .eq("recruitment_channel_id", channel.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const applications = (rows ?? []) as unknown as ApplicationRow[];

  // 키(height_cm) — 채널 담당자도 필터에 쓸 수 있게 service-role로 조회.
  const channelDancerIds = Array.from(
    new Set(applications.map((a) => a.dancer?.id).filter((id): id is string => !!id)),
  );
  const heightByDancer = new Map<string, number>();
  if (channelDancerIds.length > 0) {
    const { data: heightRows } = await admin
      .from("dancer_private_info")
      .select("dancer_id, height_cm")
      .in("dancer_id", channelDancerIds)
      .not("height_cm", "is", null);
    for (const h of (heightRows ?? []) as Array<{
      dancer_id: string;
      height_cm: number | null;
    }>) {
      if (h.height_cm != null) heightByDancer.set(h.dancer_id, h.height_cm);
    }
  }
  const { data: canDecideRaw } = await supabase.rpc(
    "can_decide_recruitment_channel_applications",
    { p_channel_id: channel.id },
  );
  const canDecide = canDecideRaw === true;
  const counts = applications.reduce(
    (acc, row) => {
      acc.total++;
      if (row.status === "pending") acc.pending++;
      if (row.status === "accepted") acc.accepted++;
      if (row.status === "rejected" || row.status === "declined") acc.rejected++;
      return acc;
    },
    { total: 0, pending: 0, accepted: 0, rejected: 0 },
  );
  const consoleApplicants: ConsoleApplicant[] = applications.map((app) => {
    const name =
      app.dancer?.stage_name ?? app.applicant?.display_name ?? "(이름 없음)";
    return {
      id: app.id,
      status: app.status,
      source: app.source,
      cover_message: app.cover_message,
      created_at: app.created_at,
      isTeam: false,
      name,
      korean_name: app.dancer?.korean_name ?? null,
      avatar: app.dancer?.profile_img ?? app.applicant?.avatar_url ?? null,
      publicHref: app.dancer
        ? `/d/${app.dancer.slug ?? app.dancer.id}`
        : app.applicant?.id
          ? `/u/${app.applicant.id}`
          : null,
      dancerId: app.dancer?.id ?? null,
      gender: app.dancer?.gender ?? null,
      heightCm: app.dancer?.id ? heightByDancer.get(app.dancer.id) ?? null : null,
      genres: (app.dancer?.genres ?? []) as string[],
      location: app.dancer?.location ?? null,
      rejection_reason: app.rejection_reason ?? null,
      recruitmentChannelId: app.recruitment_channel_id ?? channel.id,
      recruitmentChannelName: channel.name,
      proposed_fee: app.proposed_fee ?? null,
      proposed_fee_currency: app.proposed_fee_currency ?? null,
      proposed_fee_unit: app.proposed_fee_unit ?? null,
      fee_status: app.fee_status ?? null,
      castingDetails: {
        applicant_name: app.applicant_name ?? null,
        birth_year: app.birth_year ?? null,
        height_cm: app.height_cm ?? null,
        primary_genre: app.primary_genre ?? null,
        dance_video_url: app.dance_video_url ?? null,
        backup_dancer_history: app.backup_dancer_history ?? null,
        personal_profile_url: app.personal_profile_url ?? null,
      },
      confirmedAt: app.confirmed_at ?? null,
      passedRound: app.passed_round ?? 0,
      // 채널 담당자 화면에서는 일괄 안내 발송을 노출하지 않는다(프로젝트 관리자 권한).
      noticeSent: true,
      evalCount: 0,
      avgScore: null,
      myScore: null,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <Link
        href={`/c/${channel.share_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 모집 링크
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          모집채널
        </p>
        <h1 className="text-xl font-bold leading-tight tracking-tight">
          {channel.name}
        </h1>
        <p className="text-sm text-ink-2">
          {project?.title ?? "프로젝트"} · 지원 {counts.total}명 · 수락{" "}
          {counts.accepted}명 · 대기 {counts.pending}명
        </p>
      </header>

      {channel.status !== "active" ? (
        <p className="rounded-xl border border-border bg-secondary/50 p-4 text-sm text-ink-2">
          이 채널은 현재 {channel.status} 상태입니다. 기존 지원자 조회는 가능합니다.
        </p>
      ) : null}

      {!canDecide ? (
        <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-ink-2">
          현재 담당자는 명단 보기 권한만 있습니다.
          승인과 거절 처리는 프로젝트 관리자에게 요청해주세요.
        </p>
      ) : null}

      <ApplicantsConsole
        projectId={channel.project_id}
        recruitmentCount={project?.recruitment_count ?? counts.total}
        selectionRounds={project?.selection_rounds ?? 2}
        roundLabels={project?.round_labels ?? null}
        initial={consoleApplicants}
        channels={[{ id: channel.id, name: channel.name }]}
        canDecide={canDecide}
      />
    </div>
  );
}

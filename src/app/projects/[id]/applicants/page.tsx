import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DecideButtons } from "@/components/project/DecideButtons";
import { RecommendedDancers } from "@/components/project/RecommendedDancers";
import { SearchAndPropose } from "@/components/project/SearchAndPropose";
import { ManagersPanel, type ProjectManager } from "@/components/project/ManagersPanel";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";

type Application = {
  id: string;
  status: keyof typeof APPLICATION_STATUS_LABELS;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  responded_at: string | null;
  applicant: { id: string; display_name: string; avatar_url: string | null } | null;
  dancer:
    | {
        id: string;
        stage_name: string;
        korean_name: string | null;
        slug: string | null;
        profile_img: string | null;
      }
    | null;
  team: { id: string; team_name: string; slug: string | null; profile_img: string | null } | null;
};

type Project = { id: string; short_code: string; owner_id: string; title: string; recruitment_count: number };

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

const STATUS_COLOR: Record<string, string> = {
  pending: "text-ink-2",
  accepted: "text-ok",
  rejected: "text-destructive",
  withdrawn: "text-ink-3",
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
    .select("id, short_code, owner_id, title, recruitment_count")
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
  // 소유자·슈퍼관리자만 공동관리자를 추가/삭제할 수 있다.
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
  type MgrRow = {
    profile_id: string;
    profile: ProfileLite | ProfileLite[] | null;
  };
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
  // 점수 수치는 반환하지 않으며 genre/location_match 불리언만 노출한다.
  const { data: matchData } = await supabase.rpc("match_dancers_for_project", {
    p_id: p.id,
    _limit: 12,
  });
  const recommended = (matchData ?? []) as RecommendedDancer[];

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, responded_at,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img ),
       team:teams!applications_team_id_fkey ( id, team_name, slug, profile_img )`,
    )
    .eq("project_id", p.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Application[];

  const pending = list.filter((a) => a.status === "pending");
  const decided = list.filter((a) => a.status !== "pending");
  const acceptedCount = list.filter((a) => a.status === "accepted").length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href={`/projects/${p.short_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 지원자</p>
        <h1 className="text-xl font-bold tracking-tight leading-tight">{p.title}</h1>
        <p className="text-sm text-ink-2">
          총 {list.length}명 · 수락 {acceptedCount} / {p.recruitment_count}
        </p>
      </header>

      <ManagersPanel
        projectId={p.id}
        canEdit={canEditManagers}
        managers={managers}
      />

      {recommended.length > 0 ? (
        <RecommendedDancers projectId={p.id} dancers={recommended} />
      ) : null}

      <SearchAndPropose projectId={p.id} />
      {pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            대기 중 ({pending.length})
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((a) => (
              <ApplicantRow key={a.id} app={a} showActions />
            ))}
          </ul>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            처리 완료 ({decided.length})
          </p>
          <ul className="flex flex-col gap-2">
            {decided.map((a) => (
              // 시나리오 5: 결정 후에도 수락↔거절 재전이 가능하므로 actions 유지.
              // 단 사용자가 취소한 지원(withdrawn) 등은 액션 숨김.
              <ApplicantRow
                key={a.id}
                app={a}
                showActions={a.status === "accepted" || a.status === "rejected" || a.status === "declined"}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 지원자가 없습니다.
        </p>
      ) : null}
    </div>
  );
}

function ApplicantRow({
  app,
  showActions,
}: {
  app: Application;
  showActions?: boolean;
}) {
  const isTeam = !!app.team;
  // 시나리오 3: 지원자 목록은 user(profiles) 가 아니라 **dancer 기준**으로 표시.
  // 같은 user 가 여러 dancer 중 어느 dancer 로 지원했는지, 매니저가 가공한 dancer 로
  // 지원한 케이스 등을 정확히 식별하기 위함. dancer 가 없는 옛 데이터는 applicant
  // profile 로 폴백.
  const name = isTeam
    ? app.team?.team_name ?? "(팀)"
    : app.dancer
      ? app.dancer.stage_name
      : app.applicant?.display_name ?? "(알 수 없음)";
  const subtitle = !isTeam && app.dancer?.korean_name ? app.dancer.korean_name : null;
  const avatar = isTeam
    ? app.team?.profile_img
    : app.dancer?.profile_img ?? app.applicant?.avatar_url ?? null;
  const publicHref = isTeam
    ? `/t/${app.team?.slug ?? app.team?.id}`
    : app.dancer
      ? `/d/${app.dancer.slug ?? app.dancer.id}`
      : app.applicant?.id
        ? `/u/${app.applicant.id}`
        : null;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        {avatar ? (
          <Image
            src={avatar}
            alt={name}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
            {name[0]}
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {publicHref ? (
              <Link href={publicHref} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {isTeam ? (
              <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">팀</span>
            ) : null}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-ink-3">{subtitle}</p>
          ) : null}
          {!isTeam && app.dancer && app.applicant ? (
            <p className="mt-0.5 text-[10px] text-ink-3">
              계정: {app.applicant.display_name}
            </p>
          ) : null}
          <p className={`mt-0.5 text-[11px] ${STATUS_COLOR[app.status] ?? "text-ink-3"}`}>
            {app.source === "direct_proposal" ? "제안" : "지원"} · {APPLICATION_STATUS_LABELS[app.status]}
          </p>
        </div>
      </div>
      {app.cover_message ? (
        <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-ink-2">
          {app.cover_message}
        </p>
      ) : null}
      {showActions ? (
        <DecideButtons applicationId={app.id} currentStatus={app.status} />
      ) : null}
    </li>
  );
}

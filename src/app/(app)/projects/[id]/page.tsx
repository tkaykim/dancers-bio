import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApplyForm, type ApplyAsOption } from "@/components/project/ApplyForm";
import { AgreedPayEditor } from "@/components/project/AgreedPayEditor";
import {
  PAY_TYPE_LABELS,
  SESSION_TYPE_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: keyof typeof STATUS_LABELS;
  pay_amount: number | null;
  pay_type: keyof typeof PAY_TYPE_LABELS | null;
  agreed_pay: number | null;
  recruitment_count: number;
  allow_team_apply: boolean;
  posted_by_admin_id: string | null;
  application_deadline: string | null;
  created_at: string;
  region_text: string | null;
  genre: { label_ko: string } | null;
  region: { label_ko: string } | null;
};

type SessionRow = {
  id: string;
  session_type: keyof typeof SESSION_TYPE_LABELS;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  role_notes: string | null;
  sort_order: number;
};

type ApplicationRow = {
  id: string;
  status: string;
  applicant_id: string | null;
  dancer_id: string | null;
  team_id: string | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPay(p: { pay_amount: number | null; pay_type: string | null }): string {
  if (!p.pay_amount && p.pay_type !== "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  return `₩ ${p.pay_amount.toLocaleString("ko-KR")}${p.pay_type === "per_session" ? " · 회차당" : ""}`;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      `id, owner_id, title, description, visibility, status, pay_amount, pay_type,
       agreed_pay, recruitment_count, allow_team_apply, posted_by_admin_id,
       application_deadline, created_at, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) notFound();
  const p = project as unknown as ProjectRow;

  const [
    { data: sessionsData },
    { data: ownerProfile },
    { data: viewerProfile },
    { data: ownDancers },
    { data: ledTeamRows },
    { data: myApplications },
    { count: acceptedCount },
  ] = await Promise.all([
    supabase
      .from("project_sessions")
      .select("id, session_type, starts_at, ends_at, location_name, role_notes, sort_order")
      .eq("project_id", id)
      .order("sort_order")
      .order("starts_at"),
    supabase.from("profiles").select("display_name, id").eq("id", p.owner_id).single(),
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    // 시나리오 2: 본인이 보유한 dancer 가 N 개일 수 있으므로 배열로 가져와
    // 각 dancer 별 지원 옵션을 노출한다 (multi-dancer 명시적 선택 UX).
    supabase
      .from("dancers")
      .select("id, stage_name, korean_name")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("teams")
      .select("id, team_name, is_active, approval_status, lead_profile_id")
      .eq("lead_profile_id", user.id)
      .eq("is_active", true),
    supabase
      .from("applications")
      .select("id, status, applicant_id, dancer_id, team_id")
      .eq("project_id", id)
      .or(`applicant_id.eq.${user.id},team_id.in.(${"00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: false }),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("status", "accepted")
      .is("archived_at", null),
  ]);

  const sessions = (sessionsData ?? []) as SessionRow[];
  const isAdmin = !!viewerProfile?.is_admin;
  const isOwner = p.owner_id === user.id;
  const canEditAgreedPay = isOwner || isAdmin;

  // Build my applications. Use a follow-up query for team apps because OR with .in() above can't be parameterized cleanly.
  let allMine: ApplicationRow[] = (myApplications ?? []) as ApplicationRow[];
  const ledTeamIds = (ledTeamRows ?? []).map((t) => t.id as string);
  if (ledTeamIds.length > 0) {
    const { data: teamApps } = await supabase
      .from("applications")
      .select("id, status, applicant_id, dancer_id, team_id")
      .eq("project_id", id)
      .in("team_id", ledTeamIds);
    const seen = new Set(allMine.map((a) => a.id));
    for (const a of (teamApps ?? []) as ApplicationRow[]) {
      if (!seen.has(a.id)) allMine = allMine.concat(a);
    }
  }
  const mineTeams = allMine.filter((a) => a.team_id);
  // 본인이 한 개인 지원(현재 라인업 노출용). applicant_id 본인 또는 본인 dancer
  // 둘 중 하나에 매칭되는 가장 최신 row.
  const mineIndividual =
    allMine.find(
      (a) =>
        a.applicant_id === user.id ||
        (a.dancer_id !== null &&
          (ownDancers ?? []).some((d) => (d as { id: string }).id === a.dancer_id)),
    ) ?? null;

  // 활성 지원만 "이미 지원 중"으로 간주. withdrawn / rejected 는 새 지원 가능.
  const isActiveStatus = (s: string) => s === "pending" || s === "accepted";

  const dDay = daysUntil(p.application_deadline);

  const applyOptions: ApplyAsOption[] = [];
  // 시나리오 2: 본인의 각 dancer 별로 옵션 생성. 같은 dancer 로 이미 활성 지원 중이면
  // 그 dancer 옵션 제외 (재지원 불가). 비활성(withdrawn/rejected) 이면 라벨에 "다시 지원" 표기.
  type OwnDancer = { id: string; stage_name: string; korean_name: string | null };
  const ownDancerList = (ownDancers ?? []) as OwnDancer[];
  for (const d of ownDancerList) {
    const mineForDancer = allMine.find((a) => a.dancer_id === d.id);
    if (mineForDancer && isActiveStatus(mineForDancer.status)) continue;
    const label = `${d.stage_name}${d.korean_name ? ` (${d.korean_name})` : ""}${mineForDancer ? "으로 다시 지원" : "으로 지원"}`;
    applyOptions.push({ kind: "individual", dancer_id: d.id, label });
  }
  if (p.allow_team_apply) {
    for (const t of ledTeamRows ?? []) {
      const activeTeamApp = mineTeams.find(
        (a) => a.team_id === t.id && isActiveStatus(a.status),
      );
      const hadAnyTeamApp = mineTeams.some((a) => a.team_id === t.id);
      if (!activeTeamApp && t.lead_profile_id !== p.owner_id) {
        applyOptions.push({
          kind: "team",
          team_id: t.id as string,
          label: hadAnyTeamApp
            ? `팀 [${t.team_name}]으로 다시 지원`
            : `팀 [${t.team_name}]으로 지원`,
        });
      }
    }
  }

  const acceptedNow = acceptedCount ?? 0;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/feed"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 캐스팅 피드
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {VISIBILITY_LABELS[p.visibility]}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
            {STATUS_LABELS[p.status]}
          </span>
          {p.allow_team_apply ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              팀 지원 가능
            </span>
          ) : null}
          {p.genre?.label_ko ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              {p.genre.label_ko}
            </span>
          ) : null}
          {p.region_text || p.region?.label_ko ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              {p.region_text ?? p.region?.label_ko}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {p.title}
        </h1>
        {ownerProfile ? (
          <p className="text-sm text-ink-2">
            {ownerProfile.display_name}
            {p.posted_by_admin_id ? " · 관리자가 대신 등록" : ""}
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-3 rounded-xl border border-border bg-card divide-x divide-border">
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">페이</p>
          <p className="font-mono text-base font-semibold">{fmtPay(p)}</p>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">모집</p>
          <p className="font-mono text-base font-semibold">
            {acceptedNow} / {p.recruitment_count}
          </p>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">마감</p>
          <p className="font-mono text-base font-semibold">
            {dDay !== null ? (dDay === 0 ? "오늘" : `D-${dDay}`) : "—"}
          </p>
        </div>
      </section>

      {canEditAgreedPay ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 협의 확정 비용
          </p>
          <AgreedPayEditor projectId={p.id} initialAgreedPay={p.agreed_pay} />
        </section>
      ) : p.agreed_pay !== null ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">확정 비용</p>
          <p className="font-mono text-base font-semibold">
            ₩ {p.agreed_pay.toLocaleString("ko-KR")}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 상세 설명</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
          {p.description}
        </p>
      </section>

      {sessions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 일정 ({sessions.length})
          </p>
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                    {SESSION_TYPE_LABELS[s.session_type]}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {fmtDateTime(s.starts_at)}
                  </span>
                </div>
                {s.location_name ? <p className="text-sm">{s.location_name}</p> : null}
                {s.role_notes ? <p className="text-xs text-ink-3">{s.role_notes}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Action area */}
      {isOwner ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 운영</p>
          <Link href={`/projects/${id}/applicants`}>
            <Button className="w-full" size="lg">
              지원자 보기 →
            </Button>
          </Link>
        </section>
      ) : (
        <>
          {(mineIndividual || mineTeams.length > 0) ? (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 내 지원 상태</p>
              {mineIndividual ? (
                <p className="font-mono text-sm">개인: {labelStatus(mineIndividual.status)}</p>
              ) : null}
              {/* 팀별 최신 지원 한 건만 표시 (재지원 시 옛 row 노이즈 제거) */}
              {Array.from(
                mineTeams.reduce((acc, a) => {
                  if (a.team_id && !acc.has(a.team_id)) acc.set(a.team_id, a);
                  return acc;
                }, new Map<string, ApplicationRow>()).values(),
              ).map((a) => (
                <p key={a.id} className="font-mono text-sm">
                  팀: {labelStatus(a.status)}
                </p>
              ))}
              <Link href="/applications" className="text-xs text-ink-3 underline-offset-4 hover:underline">
                지원 목록에서 보기 →
              </Link>
            </section>
          ) : null}
          {p.status === "open" && applyOptions.length > 0 ? (
            <ApplyForm projectId={id} applyOptions={applyOptions} />
          ) : p.status !== "open" ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
              현재 모집이 닫혀 있습니다.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function labelStatus(s: string): string {
  switch (s) {
    case "pending": return "대기 중";
    case "accepted": return "수락됨";
    case "rejected": return "거절됨";
    case "withdrawn": return "취소됨";
    default: return s;
  }
}

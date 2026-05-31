import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { RecomputeScoresButton } from "@/components/admin/RecomputeScoresButton";

export default async function AdminHomePage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const [
    { count: usersCount },
    { count: pendingVerifs },
    { count: projectsCount },
    { count: applicationsCount },
    { count: dancersCount },
    { count: pendingDancers },
    { count: teamsCount },
    { count: pendingTeams },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("instagram_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("applications").select("id", { count: "exact", head: true }),
    supabase.from("dancers").select("id", { count: "exact", head: true }),
    supabase
      .from("dancers")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending"),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending")
      .eq("is_active", true),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          Admin console
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="사용자" value={usersCount ?? 0} />
        <Stat label="댄서 프로필" value={dancersCount ?? 0} />
        <Stat label="팀" value={teamsCount ?? 0} />
        <Stat label="프로젝트 (활성)" value={projectsCount ?? 0} />
        <Stat label="지원/제안" value={applicationsCount ?? 0} />
      </section>

      <section className="flex flex-col gap-3">
        <Tile
          href="/admin/dancers"
          title="댄서 승인 큐"
          desc="신규 프로필 승인/거부 + 노출 순서 조정"
          badge={pendingDancers ? `${pendingDancers} 대기` : undefined}
          accent={Boolean(pendingDancers)}
        />
        <Tile
          href="/admin/teams"
          title="팀 승인 큐"
          desc="신규 팀 승인/거부"
          badge={pendingTeams ? `${pendingTeams} 대기` : undefined}
          accent={Boolean(pendingTeams)}
        />
        <Tile
          href="/admin/verifications"
          title="인증 큐"
          desc="인스타 DM 인증 요청 검토"
          badge={pendingVerifs ? `${pendingVerifs} 대기` : undefined}
          accent={Boolean(pendingVerifs)}
        />
        <Tile
          href="/admin/projects"
          title="공고 관리"
          desc="등록한 캐스팅 공고 수정·삭제"
          badge={projectsCount ? `${projectsCount}` : undefined}
        />
        <Tile
          href="/admin/projects/import"
          title="공고 수집 (외부)"
          desc="외부 채널 공고 텍스트 붙여넣기 → LLM 추출 → 발행"
          accent
        />
        <Tile
          href="/admin/llm"
          title="LLM 설정"
          desc="Anthropic / Gemini 토글 + 연결 상태 + 테스트"
        />
        <Tile
          href="/admin/users"
          title="사용자 / 권한"
          desc="사용자 검색 + can_create_project 토글"
        />
        <Tile
          href="/admin/scores"
          title="경력 점수 (내부)"
          desc="프로 근접도 랭킹 + 경력별 점수 분해 · 비노출"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">시스템</h2>
        <RecomputeScoresButton />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function Tile({
  href,
  title,
  desc,
  badge,
  accent,
}: {
  href: string;
  title: string;
  desc: string;
  badge?: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-xl border p-4 transition-colors ${
        accent
          ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
          : "border-border bg-card hover:bg-secondary"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold">{title}</p>
          {badge ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-ink-3">{desc}</p>
      </div>
      <span className="text-ink-3 transition-transform group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

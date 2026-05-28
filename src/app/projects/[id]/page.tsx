import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/components/project/ApplyForm";
import { AgreedPayEditor } from "@/components/project/AgreedPayEditor";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { classifyProjectIdentifier } from "@/lib/projectId";
import {
  PAY_TYPE_LABELS,
  SESSION_TYPE_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: idParam } = await params;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) return { title: "프로젝트를 찾을 수 없습니다" };
  const supabase = await createClient();
  const baseQ = supabase
    .from("projects")
    .select("title, description, status")
    .is("deleted_at", null);
  const { data: p } = await (
    identifier.kind === "uuid"
      ? baseQ.eq("id", identifier.value)
      : baseQ.eq("short_code", identifier.value)
  ).maybeSingle();
  if (!p) return { title: "프로젝트를 찾을 수 없습니다" };
  const firstLine =
    ((p.description as string | null) ?? "")
      .split("\n")
      .find((l: string) => l.trim()) ?? "";
  const desc = firstLine.length > 0 ? firstLine.slice(0, 140) : "댄서 캐스팅 공고";
  return {
    title: p.title as string,
    description: desc,
    openGraph: {
      title: `${p.title} · dancers.bio`,
      description: desc,
      siteName: "dancers.bio",
      type: "article",
    },
  };
}

type ProjectRow = {
  id: string;
  short_code: string;
  owner_id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: keyof typeof STATUS_LABELS;
  pay_amount: number | null;
  pay_type: keyof typeof PAY_TYPE_LABELS | null;
  agreed_pay: number | null;
  recruitment_count: number;
  posted_by_label: string | null;
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
  const { id: idParam } = await params;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) notFound();

  // 익명도 비공개 프로젝트 상세를 열람할 수 있도록 getUser. 지원 시점에만 로그인 유도.
  const user = await getUser();
  const supabase = await createClient();

  const baseQuery = supabase
    .from("projects")
    .select(
      `id, short_code, owner_id, title, description, visibility, status, pay_amount, pay_type,
       agreed_pay, recruitment_count, posted_by_label,
       application_deadline, created_at, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .is("deleted_at", null);

  const { data: project } = await (
    identifier.kind === "uuid"
      ? baseQuery.eq("id", identifier.value)
      : baseQuery.eq("short_code", identifier.value)
  ).maybeSingle();

  if (!project) notFound();
  const p = project as unknown as ProjectRow;
  // Internal route segment: canonical UUID. Outbound links prefer short_code.
  const id = p.id;

  const [
    { data: sessionsData },
    { data: ownerProfile },
  ] = await Promise.all([
    supabase
      .from("project_sessions")
      .select("id, session_type, starts_at, ends_at, location_name, role_notes, sort_order")
      .eq("project_id", id)
      .order("sort_order")
      .order("starts_at"),
    supabase.from("profiles").select("display_name, id").eq("id", p.owner_id).single(),
  ]);

  // 익명 방문자는 본인 관련 쿼리 스킵.
  type ViewerProfile = { is_admin: boolean | null };
  type OwnDancerLite = { id: string };
  let viewerProfile: ViewerProfile | null = null;
  let ownDancers: OwnDancerLite[] = [];
  let myApplications: ApplicationRow[] = [];
  if (user) {
    const [
      { data: vp },
      { data: od },
      { data: ma },
    ] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
      supabase
        .from("dancers")
        .select("id")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase
        .from("applications")
        .select("id, status, applicant_id, dancer_id")
        .eq("project_id", id)
        .eq("applicant_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    viewerProfile = (vp ?? null) as ViewerProfile | null;
    ownDancers = (od ?? []) as OwnDancerLite[];
    myApplications = (ma ?? []) as ApplicationRow[];
  }

  const sessions = (sessionsData ?? []) as SessionRow[];
  const isAdmin = !!viewerProfile?.is_admin;
  const isOwner = !!user && p.owner_id === user.id;
  const canEditAgreedPay = isOwner || isAdmin;
  const hasDancer = ownDancers.length > 0;

  // Lite: 활성 지원만 "이미 지원 중"으로 간주. withdrawn / rejected 는 새 지원 가능.
  const isActiveStatus = (s: string) => s === "pending" || s === "accepted";
  const allMine = myApplications;
  const mineActive = allMine.find((a) => isActiveStatus(a.status)) ?? null;
  const mineMostRecent = allMine[0] ?? null;

  const dDay = daysUntil(p.application_deadline);
  const postedBy = p.posted_by_label ?? ownerProfile?.display_name ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href={user ? "/feed" : "/"}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← {user ? "캐스팅 피드" : "dancers.bio"}
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {VISIBILITY_LABELS[p.visibility]}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
            {STATUS_LABELS[p.status]}
          </span>
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
        {postedBy ? (
          <p className="text-sm text-ink-2">{postedBy}</p>
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
            {p.recruitment_count}명
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
      {isOwner || isAdmin ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 운영</p>
          <Link href={`/projects/${p.short_code}/applicants`}>
            <Button className="w-full" size="lg">
              지원자 보기 →
            </Button>
          </Link>
          {isAdmin ? (
            <>
              <Link href={`/projects/${p.short_code}/edit`}>
                <Button variant="outline" className="w-full" size="lg">
                  공고 수정
                </Button>
              </Link>
              <DeleteProjectButton projectId={p.id} variant="ghost" />
            </>
          ) : null}
        </section>
      ) : !user ? (
        p.status === "open" ? (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-ink-2">
              지원하려면 로그인 또는 회원가입이 필요해요.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/projects/${p.short_code}?apply=1`)}`}
            >
              <Button className="w-full" size="lg">
                로그인하고 지원하기 →
              </Button>
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(`/projects/${p.short_code}?apply=1`)}`}
            >
              <Button variant="outline" className="w-full" size="lg">
                회원가입
              </Button>
            </Link>
          </section>
        ) : (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
            현재 모집이 닫혀 있습니다.
          </p>
        )
      ) : (
        <>
          {mineMostRecent ? (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 내 지원 상태</p>
              <p className="font-mono text-sm">{labelStatus(mineMostRecent.status)}</p>
              <Link href="/applications" className="text-xs text-ink-3 underline-offset-4 hover:underline">
                지원 목록에서 보기 →
              </Link>
            </section>
          ) : null}
          {p.status === "open" && !mineActive ? (
            <ApplyForm
              projectId={p.id}
              projectShortCode={p.short_code}
              hasDancer={hasDancer}
            />
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

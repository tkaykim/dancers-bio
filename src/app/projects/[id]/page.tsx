import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/components/project/ApplyForm";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { ShareButton } from "@/components/project/ShareButton";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { deadlineLabel, isExpired } from "@/lib/utils/deadline";
import { formatBytes } from "@/lib/storage/dancer-portfolio-file";
import {
  PAY_TYPE_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";
import { formatWhen } from "@/lib/format-when";

// 설명글 안의 http(s) URL을 클릭 가능한 링크로 변환.
// 텍스트 조각은 React가 자동 이스케이프하므로 XSS 안전 (dangerouslySetInnerHTML 미사용).
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-[#6366f1] underline underline-offset-2 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

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
    .select("title, description, status, visibility, short_code")
    .is("deleted_at", null);
  const { data: p } = await (
    identifier.kind === "uuid"
      ? baseQ.eq("id", identifier.value)
      : baseQ.eq("short_code", identifier.value)
  ).maybeSingle();
  if (!p) return { title: "프로젝트를 찾을 수 없습니다" };
  if (p.visibility === "private") {
    return {
      title: "비공개 프로젝트 · deetz",
      description: "초대 링크로만 확인할 수 있는 deetz 비공개 프로젝트입니다.",
      robots: { index: false, follow: false },
      openGraph: {
        title: "비공개 프로젝트 · deetz",
        description: "초대 링크로만 확인할 수 있는 deetz 비공개 프로젝트입니다.",
        siteName: "deetz",
        type: "website",
      },
    };
  }
  const firstLine =
    ((p.description as string | null) ?? "")
      .split("\n")
      .find((l: string) => l.trim()) ?? "";
  const desc = firstLine.length > 0 ? firstLine.slice(0, 140) : "댄서 캐스팅 공고";
  return {
    title: p.title as string,
    description: desc,
    alternates: {
      canonical: `/projects/${p.short_code}`,
    },
    openGraph: {
      title: `${p.title} · deetz`,
      description: desc,
      siteName: "deetz",
      type: "article",
      url: `/projects/${p.short_code}`,
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
  is_standing_pool: boolean | null;
  collect_applicant_fee: boolean | null;
  created_at: string;
  region_text: string | null;
  genre: { label_ko: string } | null;
  region: { label_ko: string } | null;
};

type SessionRow = {
  id: string;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
  time_tbd: boolean;
  sort_order: number;
  status: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  applicant_id: string | null;
  dancer_id: string | null;
};

type RecruitmentChannelRow = {
  id: string;
  project_id: string;
  legacy_project_id: string | null;
  name: string;
  share_code: string;
  status: string;
};


function fmtPay(p: { pay_amount: number | null; pay_type: string | null }): string {
  if (!p.pay_amount && p.pay_type !== "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  return `₩ ${p.pay_amount.toLocaleString("ko-KR")}${p.pay_type === "per_session" ? " · 회차당" : ""}`;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const { id: idParam } = await params;
  const { channel: channelParam } = await searchParams;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) notFound();
  const channelCode =
    typeof channelParam === "string"
      ? channelParam.trim()
      : Array.isArray(channelParam)
        ? channelParam[0]?.trim() ?? ""
        : "";

  // 익명도 비공개 프로젝트 상세를 열람할 수 있도록 getUser. 지원 시점에만 로그인 유도.
  const user = await getUser();
  const supabase = await createClient();

  const baseQuery = supabase
    .from("projects")
    .select(
      `id, short_code, owner_id, title, description, visibility, status, pay_amount, pay_type,
       agreed_pay, recruitment_count, posted_by_label,
       application_deadline, is_standing_pool, collect_applicant_fee, created_at, region_text,
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

  // 일정은 admin 클라이언트로 조회 — 비로그인/비공개 프로젝트에서도 날짜·라벨이 보이게 하되,
  // location(장소)은 SELECT에서 제외해 대외비를 유지한다. RLS는 그대로 둬서 직접 API 조회로도 장소가 새지 않음.
  const admin = createAdminClient();

  const [
    { data: sessionsData },
    { data: ownerProfile },
    { data: attachmentsData },
    { data: channelData },
  ] = await Promise.all([
    admin
      .from("project_schedules")
      .select("id, label, starts_at, ends_at, time_tbd, sort_order, status")
      .eq("project_id", id)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("sort_order"),
    supabase.from("profiles").select("display_name, id").eq("id", p.owner_id).single(),
    supabase
      .from("project_attachments")
      .select("id, file_name, storage_path, mime_type, size_bytes")
      .eq("project_id", id)
      .order("sort_order"),
    channelCode
      ? admin
          .from("recruitment_channels")
          .select("id, project_id, legacy_project_id, name, share_code, status")
          .eq("share_code", channelCode)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const channel = (channelData ?? null) as RecruitmentChannelRow | null;
  const activeRecruitmentChannel =
    channel &&
    (channel.project_id === id || channel.legacy_project_id === id)
      ? channel
      : null;

  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const attachments = ((attachmentsData ?? []) as Array<{
    id: string;
    file_name: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
  }>).map((a) => ({
    ...a,
    url: `${supabaseBase}/storage/v1/object/public/project-files/${a.storage_path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  }));

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

  // 공지사항 — user 클라이언트로 조회해 RLS(pa_select_audience)가 열람대상 필터.
  // 비로그인은 'public' 공지만, 로그인 지원자는 본인 상태 대상 공지까지 노출.
  const { data: annData } = await supabase
    .from("project_announcements")
    .select("id, title, body, pinned, created_at")
    .eq("project_id", id)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const announcements = (annData ?? []) as Array<{
    id: string;
    title: string | null;
    body: string;
    pinned: boolean;
    created_at: string;
  }>;
  const isAdmin = !!viewerProfile?.is_admin;
  const isOwner = !!user && p.owner_id === user.id;
  // 소유자·슈퍼관리자는 즉시 true, 그 외 로그인 사용자는 공동관리자 여부 확인.
  const canManage =
    isOwner || isAdmin ? true : !!user && (await canManageProject(p.id));
  const hasDancer = ownDancers.length > 0;

  // Lite: 활성 지원만 "이미 지원 중"으로 간주. withdrawn / rejected 는 새 지원 가능.
  const isActiveStatus = (s: string) => s === "pending" || s === "accepted";
  const allMine = myApplications;
  const mineActive = allMine.find((a) => isActiveStatus(a.status)) ?? null;
  const mineMostRecent = allMine[0] ?? null;

  const postedBy = p.posted_by_label ?? ownerProfile?.display_name ?? null;

  // 지원 가능 = 모집 중 + 마감일 안 지남. 마감일 지나면 status가 open이어도 닫힘 처리.
  // 상시 섭외풀은 마감이 없어 만료되지 않음 (계속 지원 가능).
  const standingPool = !!p.is_standing_pool;
  const expired = isExpired(p.application_deadline, standingPool);
  const applyOpen = p.status === "open" && !expired;
  const closedMsg = expired
    ? "지원 마감일이 지났습니다."
    : "현재 모집이 닫혀 있습니다.";
  const applyParams = new URLSearchParams({ apply: "1" });
  if (activeRecruitmentChannel) {
    applyParams.set("channel", activeRecruitmentChannel.share_code);
  }
  const applyReturnPath = `/projects/${p.short_code}?${applyParams.toString()}`;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={user ? "/feed" : "/"}
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← {user ? "캐스팅 피드" : "deetz"}
        </Link>
        <ShareButton shortCode={p.short_code} title={p.title} />
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {VISIBILITY_LABELS[p.visibility]}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
            {STATUS_LABELS[p.status]}
          </span>
          {standingPool ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              상시 모집
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
            {standingPool ? "상시" : deadlineLabel(p.application_deadline)}
          </p>
        </div>
      </section>

      {/* 협의 확정 비용 — 의미 없어 일단 숨김 (추후 복구 가능) */}

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 상세 설명</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
          <Linkify text={p.description} />
        </p>
      </section>

      {attachments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 참고자료 ({attachments.length})
          </p>
          <ul className="flex flex-col gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:bg-secondary"
                >
                  <span className="text-lg leading-none">📄</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {a.file_name}
                    </span>
                    <span className="block text-[11px] text-ink-3">
                      {a.mime_type?.includes("pdf") ? "PDF" : a.mime_type ?? "파일"}
                      {a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-ink-3">열기 →</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {announcements.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 공지 ({announcements.length})
          </p>
          <ul className="flex flex-col gap-2">
            {announcements.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.pinned ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      고정
                    </span>
                  ) : null}
                  {a.title ? (
                    <p className="text-sm font-semibold">{a.title}</p>
                  ) : null}
                  <span className="text-[11px] text-ink-3">
                    {new Intl.DateTimeFormat("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Seoul",
                    }).format(new Date(a.created_at))}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-2">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 일정 ({sessions.length})
          </p>
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-xl border bg-card p-3 ${
                  s.status === "cancelled"
                    ? "border-hairline-2 opacity-75"
                    : "border-border"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`truncate text-sm font-medium ${
                      s.status === "cancelled" ? "text-ink-3 line-through" : ""
                    }`}
                  >
                    {s.label}
                  </span>
                  {s.status === "confirmed" ? (
                    <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">
                      확정
                    </span>
                  ) : s.status === "cancelled" ? (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      취소됨
                    </span>
                  ) : s.status === "undecided" ? (
                    <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                      미정
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-2">
                  {formatWhen(s.starts_at, s.ends_at, s.time_tbd)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Action area */}
      {canManage ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 운영</p>
          <Link href={`/projects/${p.short_code}/applicants`}>
            <Button className="w-full" size="lg">
              지원자 보기 →
            </Button>
          </Link>
          <Link href={`/projects/${p.short_code}/edit`}>
            <Button variant="outline" className="w-full" size="lg">
              공고 수정
            </Button>
          </Link>
          {isOwner || isAdmin ? (
            <DeleteProjectButton projectId={p.id} variant="ghost" />
          ) : null}
        </section>
      ) : !user ? (
        applyOpen ? (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-ink-2">
              지원하려면 로그인 또는 회원가입이 필요해요.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(applyReturnPath)}`}
            >
              <Button className="w-full" size="lg">
                로그인하고 지원하기 →
              </Button>
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(applyReturnPath)}`}
            >
              <Button variant="outline" className="w-full" size="lg">
                회원가입
              </Button>
            </Link>
          </section>
        ) : (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
            {closedMsg}
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
          {applyOpen && !mineActive ? (
            <ApplyForm
              projectId={p.id}
              projectShortCode={p.short_code}
              hasDancer={hasDancer}
              collectFee={!!p.collect_applicant_fee}
              recruitmentChannelId={activeRecruitmentChannel?.id ?? null}
              recruitmentChannelName={activeRecruitmentChannel?.name ?? null}
              recruitmentChannelCode={activeRecruitmentChannel?.share_code ?? null}
            />
          ) : !applyOpen ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
              {closedMsg}
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

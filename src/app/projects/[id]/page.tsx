import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/components/project/ApplyForm";
import { OpenThreadButton } from "@/components/messaging/OpenThreadButton";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { ShareButton } from "@/components/project/ShareButton";
import { ProjectMediaGallery } from "@/components/project/ProjectMediaGallery";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { deadlineLabel, isExpired } from "@/lib/utils/deadline";
import { formatBytes } from "@/lib/storage/dancer-portfolio-file";
import type {
  PAY_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/validation/projects";
import { formatWhen } from "@/lib/format-when";
import { getLocale, serverT } from "@/lib/i18n/server";
import { localeTag, translator, tCount, type Translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import { labelFor, taxonomyLabel, type TaxonomyRow } from "@/lib/i18n/labels";
import projectMessages from "@/lib/i18n/messages/project";
import {
  EMPTY_CASTING_APPLICATION_DEFAULTS,
  type CastingApplicationDefaults,
} from "@/lib/casting-application-details";
import { normalizeNationalityOptions, type NationalityOption } from "@/lib/nationality";
import { isProjectImage, isProjectVideo } from "@/lib/storage/project-file";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(
  /\/$/,
  "",
);

type ProjectT = Translator<typeof projectMessages>;

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
  const t = translator(projectMessages, await getLocale());
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) return { title: t("meta.not_found") };
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
  if (!p) return { title: t("meta.not_found") };
  if (p.visibility === "private") {
    return {
      title: t("meta.private_title"),
      description: t("meta.private_description"),
      robots: { index: false, follow: false },
      openGraph: {
        title: t("meta.private_title"),
        description: t("meta.private_description"),
        siteName: "deetz",
        type: "website",
      },
    };
  }
  const firstLine =
    ((p.description as string | null) ?? "")
      .split("\n")
      .find((l: string) => l.trim()) ?? "";
  const desc =
    firstLine.length > 0 ? firstLine.slice(0, 140) : t("meta.fallback_description");
  return {
    title: p.title as string,
    description: desc,
    alternates: {
      canonical: `/projects/${p.short_code}`,
    },
    openGraph: {
      title: t("meta.og_title", { title: p.title as string }),
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
  recruitment_unlimited: boolean;
  posted_by_label: string | null;
  application_deadline: string | null;
  is_standing_pool: boolean | null;
  collect_applicant_fee: boolean | null;
  collect_casting_details: boolean | null;
  created_at: string;
  region_text: string | null;
  genre: TaxonomyRow | null;
  region: TaxonomyRow | null;
};

type SessionRow = {
  id: string;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
  time_tbd: boolean;
  sort_order: number;
  status: string;
  collect_availability: boolean;
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


function fmtPay(
  p: { pay_amount: number | null; pay_type: string | null },
  t: ProjectT,
  locale: Locale,
): string {
  if (p.pay_amount === 0 && p.pay_type === "total") return t("pay.none");
  if (!p.pay_amount && p.pay_type !== "negotiable") return t("pay.negotiable");
  if (!p.pay_amount) return t("pay.negotiable");
  const amount = p.pay_amount.toLocaleString(localeTag(locale));
  return p.pay_type === "per_session"
    ? t("pay.amount_per_session", { amount })
    : t("pay.amount", { amount });
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
  const locale = await getLocale();
  const t = await serverT(projectMessages);
  const supabase = await createClient();

  const baseQuery = supabase
    .from("projects")
    .select(
      `id, short_code, owner_id, title, description, visibility, status, pay_amount, pay_type,
       agreed_pay, recruitment_count, recruitment_unlimited, posted_by_label,
       application_deadline, is_standing_pool, collect_applicant_fee, collect_casting_details, created_at, region_text,
       genre:genres ( label_ko, label_en, label_ja ),
       region:regions ( label_ko, label_en, label_ja )`,
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
      .select("id, label, starts_at, ends_at, time_tbd, sort_order, status, collect_availability")
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
  const mediaAttachments = attachments.filter(
    (attachment) =>
      isProjectImage(attachment.mime_type) || isProjectVideo(attachment.mime_type),
  );
  const documentAttachments = attachments.filter(
    (attachment) =>
      !isProjectImage(attachment.mime_type) && !isProjectVideo(attachment.mime_type),
  );

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

  let castingDefaults: CastingApplicationDefaults = {
    ...EMPTY_CASTING_APPLICATION_DEFAULTS,
  };
  const ownDancerId = ownDancers[0]?.id ?? null;
  if (user && ownDancerId && p.collect_casting_details) {
    const [{ data: dancer }, { data: privateInfo }, { data: careerRows }] =
      await Promise.all([
        admin
          .from("dancers")
          .select(
            "id, stage_name, korean_name, slug, genres, portfolio_file_url",
          )
          .eq("id", ownDancerId)
          .maybeSingle(),
        admin
          .from("dancer_private_info")
          .select(
            "birth_date, height_cm, nationalities, nationality_code, nationality",
          )
          .eq("dancer_id", ownDancerId)
          .maybeSingle(),
        admin
          .from("careers")
          .select("title, type, details, is_representative, sort_order")
          .eq("dancer_id", ownDancerId)
          .eq("is_public", true)
          .order("is_representative", { ascending: false })
          .order("sort_order")
          .limit(60),
      ]);
    const careers = (careerRows ?? []) as Array<{
      title: string | null;
      type: string | null;
      details: { role?: string | null; description?: string | null; link?: string | null } | null;
    }>;
    const danceVideo = careers.find((career) => career.details?.link)?.details
      ?.link;
    const backupHistory = careers
      .filter((career) =>
        /백업|백댄|back\s*-?\s*up/i.test(
          [career.title, career.details?.role, career.details?.description]
            .filter(Boolean)
            .join(" "),
        ),
      )
      .map((career) =>
        [career.title, career.details?.role].filter(Boolean).join(" · "),
      )
      .join("\n");
    const profileUrl = dancer?.portfolio_file_url
      ? (dancer.portfolio_file_url as string)
      : dancer
        ? `${SITE_URL}/d/${dancer.slug ?? dancer.id}`
        : "";
    const storedNationalities = normalizeNationalityOptions(privateInfo?.nationalities);
    castingDefaults = {
      applicant_name:
        ((dancer?.korean_name as string | null) ?? "").trim() ||
        ((dancer?.stage_name as string | null) ?? ""),
      birth_year: privateInfo?.birth_date
        ? String(privateInfo.birth_date).slice(0, 4)
        : "",
      height_cm:
        privateInfo?.height_cm != null ? String(privateInfo.height_cm) : "",
      primary_genre:
        (((dancer?.genres as string[] | null) ?? [])[0] ?? "").trim(),
      dance_video_url: danceVideo ?? "",
      backup_dancer_history: backupHistory,
      personal_profile_url: profileUrl,
      nationality_options:
        storedNationalities.length > 0
          ? storedNationalities
          : privateInfo?.nationality_code && privateInfo?.nationality
            ? [
                {
                  code: String(privateInfo.nationality_code).trim().toUpperCase(),
                  label: String(privateInfo.nationality).trim(),
                } satisfies NationalityOption,
              ]
            : [],
    };
  } else if (user && ownDancerId) {
    const { data: privateInfo } = await admin
      .from("dancer_private_info")
      .select("nationalities, nationality_code, nationality")
      .eq("dancer_id", ownDancerId)
      .maybeSingle();
    const stored = normalizeNationalityOptions(privateInfo?.nationalities);
    castingDefaults.nationality_options =
      stored.length > 0
        ? stored
        : privateInfo?.nationality_code && privateInfo?.nationality
          ? [
              {
                code: String(privateInfo.nationality_code).trim().toUpperCase(),
                label: String(privateInfo.nationality).trim(),
              } satisfies NationalityOption,
            ]
          : [];
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
  const closedMsg = expired ? t("closed.expired") : t("closed.closed");
  const genreLabel = taxonomyLabel(p.genre, locale);
  const regionLabel = p.region_text ?? (taxonomyLabel(p.region, locale) || null);
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
          ← {user ? t("nav.back_feed") : "deetz"}
        </Link>
        <ShareButton shortCode={p.short_code} title={p.title} />
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {labelFor("visibility", p.visibility, locale)}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
            {labelFor("status", p.status, locale)}
          </span>
          {standingPool ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {t("badge.standing")}
            </span>
          ) : null}
          {genreLabel ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              {genreLabel}
            </span>
          ) : null}
          {regionLabel ? (
            <span
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2"
              data-ugc={p.region_text ? true : undefined}
            >
              {regionLabel}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-bold tracking-tight leading-tight" data-ugc>
          {p.title}
        </h1>
        {postedBy ? (
          <p className="text-sm text-ink-2" data-ugc>
            {postedBy}
          </p>
        ) : null}
      </header>

      <ProjectMediaGallery attachments={mediaAttachments} />

      <section className="grid grid-cols-3 rounded-xl border border-border bg-card divide-x divide-border">
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {t("stat.pay")}
          </p>
          <p className="font-mono text-base font-semibold">{fmtPay(p, t, locale)}</p>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {t("stat.recruit")}
          </p>
          <p className="font-mono text-base font-semibold">
            {p.recruitment_unlimited
              ? t("stat.recruit_unlimited")
              : tCount(t, "stat.recruit_count", locale, p.recruitment_count)}
          </p>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {t("stat.deadline")}
          </p>
          <p className="font-mono text-base font-semibold">
            {standingPool
              ? t("stat.deadline_standing")
              : deadlineLabel(p.application_deadline, {}, locale)}
          </p>
        </div>
      </section>

      {/* 협의 확정 비용 — 의미 없어 일단 숨김 (추후 복구 가능) */}

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          {t("section.description")}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2" data-ugc>
          <Linkify text={p.description} />
        </p>
      </section>

      {documentAttachments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            {t("section.attachments", { count: documentAttachments.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {documentAttachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:bg-secondary"
                >
                  <span className="text-lg leading-none">📄</span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-medium text-foreground"
                      data-ugc
                    >
                      {a.file_name}
                    </span>
                    <span className="block text-[11px] text-ink-3">
                      {a.mime_type?.includes("pdf")
                        ? "PDF"
                        : a.mime_type ?? t("attachment.file")}
                      {a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-ink-3">
                    {t("attachment.open")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {announcements.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            {t("section.announcements", { count: announcements.length })}
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
                      {t("announcement.pinned")}
                    </span>
                  ) : null}
                  {a.title ? (
                    <p className="text-sm font-semibold" data-ugc>
                      {a.title}
                    </p>
                  ) : null}
                  <span className="text-[11px] text-ink-3">
                    {new Intl.DateTimeFormat(localeTag(locale), {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Seoul",
                    }).format(new Date(a.created_at))}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-2" data-ugc>
                  {a.body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            {t("section.sessions", { count: sessions.length })}
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
                    data-ugc
                  >
                    {s.label}
                  </span>
                  {s.status === "confirmed" ? (
                    <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">
                      {t("session.confirmed")}
                    </span>
                  ) : s.status === "cancelled" ? (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      {t("session.cancelled")}
                    </span>
                  ) : s.status === "undecided" ? (
                    <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                      {t("session.undecided")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-2">
                  {formatWhen(s.starts_at, s.ends_at, s.time_tbd, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Action area */}
      {canManage ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            {t("section.manage")}
          </p>
          <Link href={`/projects/${p.short_code}/applicants`}>
            <Button className="w-full" size="lg">
              {t("manage.applicants")}
            </Button>
          </Link>
          <Link href={`/projects/${p.short_code}/edit`}>
            <Button variant="outline" className="w-full" size="lg">
              {t("manage.edit")}
            </Button>
          </Link>
          {isOwner || isAdmin ? (
            <DeleteProjectButton projectId={p.id} variant="ghost" />
          ) : null}
        </section>
      ) : !user ? (
        applyOpen ? (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            {/*
              공개 공고는 로그인 없이도 접수할 수 있게 간편 접수를 기본 경로로 둔다.
              로그인·회원가입을 먼저 요구하면 그 단계에서 이탈한다.
              계정이 있는 사람은 아래 로그인 경로로 기존 지원 이력과 이어서 쓴다.
            */}
            {p.visibility === "public" &&
            p.short_code &&
            !p.collect_casting_details &&
            !p.collect_applicant_fee ? (
              <>
                <p className="text-sm text-ink-2">{t("guest.quick_hint")}</p>
                {/*
                  모집채널을 타고 들어왔으면 간편 접수에도 그대로 넘긴다.
                  안 넘기면 채널 유입이 집계에서 통째로 빠져 담당자 화면이 0명으로 보인다.
                */}
                <Link
                  href={
                    activeRecruitmentChannel
                      ? `/apply/${p.short_code}?channel=${encodeURIComponent(activeRecruitmentChannel.share_code)}`
                      : `/apply/${p.short_code}`
                  }
                >
                  <Button className="w-full" size="lg">
                    {t("guest.quick_cta")}
                  </Button>
                </Link>
                <Link
                  href={`/login?redirect=${encodeURIComponent(applyReturnPath)}`}
                  className="text-center text-sm text-ink-3 underline"
                >
                  {t("guest.have_account")}
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2">{t("guest.login_hint")}</p>
                <Link
                  href={`/login?redirect=${encodeURIComponent(applyReturnPath)}`}
                >
                  <Button className="w-full" size="lg">
                    {t("guest.login_cta")}
                  </Button>
                </Link>
                <Link
                  href={`/signup?redirect=${encodeURIComponent(applyReturnPath)}`}
                >
                  <Button variant="outline" className="w-full" size="lg">
                    {t("guest.signup_cta")}
                  </Button>
                </Link>
              </>
            )}
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
              <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
                {t("section.my_application")}
              </p>
              <p className="font-mono text-sm">
                {labelFor("application_status", mineMostRecent.status, locale)}
              </p>
              <div className="flex items-center gap-3">
                <Link href="/applications" className="text-xs text-ink-3 underline-offset-4 hover:underline">
                  {t("mine.link")}
                </Link>
                <OpenThreadButton projectId={p.id} />
              </div>
            </section>
          ) : null}
          {applyOpen && !mineActive ? (
            <ApplyForm
              projectId={p.id}
              projectShortCode={p.short_code}
              hasDancer={hasDancer}
              collectFee={!!p.collect_applicant_fee}
              collectCastingDetails={!!p.collect_casting_details}
              castingDefaults={castingDefaults}
              nationalityOptions={castingDefaults.nationality_options}
              recruitmentChannelId={activeRecruitmentChannel?.id ?? null}
              recruitmentChannelName={activeRecruitmentChannel?.name ?? null}
              recruitmentChannelCode={activeRecruitmentChannel?.share_code ?? null}
              availabilitySchedules={sessions
                .filter(
                  (session) =>
                    session.collect_availability && session.status !== "cancelled",
                )
                .map((session) => ({
                  id: session.id,
                  label: session.label,
                  whenText: formatWhen(
                    session.starts_at,
                    session.ends_at,
                    session.time_tbd,
                    locale,
                  ),
                }))}
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


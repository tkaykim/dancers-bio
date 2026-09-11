import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectListView } from "@/components/project/ProjectListView";
import { isExpired } from "@/lib/utils/deadline";
import { getLocale, serverT } from "@/lib/i18n/server";
import { translator, tCount } from "@/lib/i18n/t";
import { taxonomyLabel, type TaxonomyRow } from "@/lib/i18n/labels";
import meta from "@/lib/i18n/messages/meta";
import feed from "@/lib/i18n/messages/feed";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = translator(meta, locale);
  const f = translator(feed, locale);
  const title = m("feed.title");
  const description = m("feed.description");
  return {
    title: { absolute: title },
    description,
    keywords: f("meta.keywords").split(","),
    alternates: { canonical: "https://deetz.kr/feed" },
    openGraph: {
      title,
      description,
      url: "https://deetz.kr/feed",
      siteName: "deetz",
      type: "website",
    },
  };
}

type Row = {
  id: string;
  short_code: string | null;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: string;
  category:
    | "performance"
    | "choreography"
    | "instructor"
    | "broadcast"
    | "advertisement"
    | "event"
    | "video"
    | "other"
    | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  application_deadline: string | null;
  is_standing_pool: boolean | null;
  created_at: string;
  owner_id: string;
  region_text: string | null;
  genre: TaxonomyRow | null;
  region: TaxonomyRow | null;
};

export default async function FeedPage() {
  // 비로그인도 피드 열람 가능. 로그인 유도는 공고 상세에서.
  const profile = await getProfile();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await serverT(feed);

  const { data: rawProjects } = await supabase
    .from("projects")
    .select(
      `id, short_code, title, description, visibility, status, category, pay_amount, pay_type,
       application_deadline, is_standing_pool, created_at, owner_id, region_text,
       genre:genres ( label_ko, label_en, label_ja ),
       region:regions ( label_ko, label_en, label_ja )`,
    )
    // open 만 가져오면 '마감된 공고 포함' 토글을 켜도 닫힌 공고가 안 나온다.
    // deetz 에서 "마감"은 두 가지다 — ① 마감일 경과 ② 운영자가 공고를 닫음(status=closed).
    // 토글이 ①만 덮고 있었고 ②는 클라이언트로 아예 내려오지 않아 영원히 볼 수 없었다.
    // draft·cancelled 는 공개 대상이 아니므로 계속 제외한다.
    .in("status", ["open", "closed"])
    .is("deleted_at", null)
    // 최신순으로 가져온다. 만료 공고가 ascending deadline 정렬로 상단을 차지해
    // limit을 잠식하지 않도록(클라이언트가 마감순 재정렬). 기본 노출에서 만료는 제외.
    .order("created_at", { ascending: false })
    .limit(200);

  const projects = (rawProjects ?? []) as unknown as Row[];

  // Fetch owner names + session counts in batch
  const ownerIds = Array.from(new Set(projects.map((p) => p.owner_id)));
  const projectIds = projects.map((p) => p.id);

  const [{ data: ownersData }, { data: sessionsData }] = await Promise.all([
    ownerIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    projectIds.length > 0
      ? supabase
          .from("project_schedules")
          .select("project_id, starts_at")
          .in("project_id", projectIds)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as { project_id: string; starts_at: string }[] }),
  ]);

  const ownerMap = new Map((ownersData ?? []).map((o) => [o.id, o.display_name]));
  const sessionMap = new Map<string, number>();
  for (const s of sessionsData ?? []) {
    sessionMap.set(s.project_id, (sessionMap.get(s.project_id) ?? 0) + 1);
  }

  const isAdmin = !!profile?.is_admin;

  const enriched = projects.map((p) => {
    const isPrivate = p.visibility === "private";
    // 비공개 공고는 admin 외엔 제목·세부정보를 "서버에서" 마스킹해 클라이언트로 보내지 않는다.
    // (ProjectListView가 "use client" → props가 HTML/RSC 페이로드로 직렬화되어
    //  화면에 안 보여도 크롤러·소스보기로 실제 제목이 새던 문제를 차단.)
    const revealDetails = !isPrivate || isAdmin;
    return {
      id: p.id,
      short_code: revealDetails ? p.short_code : null,
      visibility: p.visibility,
      status: p.status,
      title: revealDetails ? p.title : t("row.private_title"),
      category: revealDetails ? p.category : null,
      pay_amount: revealDetails ? p.pay_amount : null,
      pay_type: revealDetails ? p.pay_type : null,
      application_deadline: p.application_deadline,
      is_standing_pool: !!p.is_standing_pool,
      created_at: p.created_at,
      owner_name: revealDetails ? (ownerMap.get(p.owner_id) ?? null) : null,
      genre_label: revealDetails ? (taxonomyLabel(p.genre, locale) || null) : null,
      region_label: revealDetails
        ? (p.region_text ?? (taxonomyLabel(p.region, locale) || null))
        : null,
      session_count: sessionMap.get(p.id) ?? 0,
    };
  });

  const canCreate = profile?.can_create_project || profile?.is_admin;
  // 헤더 "모집 중" 카운트는 실제로 지금 지원할 수 있는 공고 기준.
  // 마감일이 지났거나 공고가 닫혔으면 모집 중이 아니다.
  const activeCount = enriched.filter(
    (p) =>
      p.status === "open" && !isExpired(p.application_deadline, p.is_standing_pool),
  ).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-none tracking-tight">
            Casting
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-3">
            {tCount(t, "header.count", locale, activeCount)}
          </p>
        </div>
        {canCreate ? (
          <Link href="/projects/new">
            <Button size="sm" className="rounded-full">
              {t("header.create")}
            </Button>
          </Link>
        ) : !profile ? (
          <div className="flex gap-1.5">
            <Link href="/login?next=/feed">
              <Button size="sm" variant="outline" className="rounded-full">
                {t("header.login")}
              </Button>
            </Link>
            <Link href="/signup?next=/feed">
              <Button size="sm" className="rounded-full">
                {t("header.signup")}
              </Button>
            </Link>
          </div>
        ) : null}
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">{t("header.empty")}</p>
        </div>
      ) : (
        <ProjectListView projects={enriched} isAdmin={isAdmin} />
      )}
    </div>
  );
}

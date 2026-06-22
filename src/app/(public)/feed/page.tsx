import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectListView } from "@/components/project/ProjectListView";
import { isExpired } from "@/lib/utils/deadline";

export const metadata: Metadata = {
  title: "댄서 섭외 공고·캐스팅 콜 | deetz(디츠)",
  description:
    "디츠(deetz)에 등록된 댄서 섭외·캐스팅 공고를 한 곳에서. MV, 광고, 무대, 방송, 행사 백댄서 섭외와 안무 제작, 안무가 섭외, 댄스팀 섭외 공고를 확인하고 포트폴리오로 지원하세요.",
  keywords: [
    "댄서 섭외 공고",
    "댄서 캐스팅 공고",
    "백댄서 섭외",
    "안무가 섭외",
    "댄스팀 섭외",
    "댄서 구인",
    "디츠",
    "deetz",
  ],
  alternates: { canonical: "https://deetz.kr/feed" },
  openGraph: {
    title: "댄서 섭외 공고·캐스팅 콜 | deetz(디츠)",
    description:
      "MV, 광고, 무대, 방송, 행사 댄서 섭외·캐스팅 공고를 확인하고 포트폴리오로 지원하세요.",
    url: "https://deetz.kr/feed",
    siteName: "deetz",
    type: "website",
  },
};

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
  genre: { label_ko: string } | null;
  region: { label_ko: string } | null;
};

export default async function FeedPage() {
  // 비로그인도 피드 열람 가능. 로그인 유도는 공고 상세에서.
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: rawProjects } = await supabase
    .from("projects")
    .select(
      `id, short_code, title, description, visibility, status, category, pay_amount, pay_type,
       application_deadline, is_standing_pool, created_at, owner_id, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("status", "open")
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
    // 비공개 공고는 admin 외엔 short_code도 노출하지 않음 (DOM 인스펙트로도 못 찾게)
    const revealDetails = !isPrivate || isAdmin;
    return {
      id: p.id,
      short_code: revealDetails ? p.short_code : null,
      visibility: p.visibility,
      title: p.title,
      category: p.category,
      pay_amount: p.pay_amount,
      pay_type: p.pay_type,
      application_deadline: p.application_deadline,
      is_standing_pool: !!p.is_standing_pool,
      created_at: p.created_at,
      owner_name: ownerMap.get(p.owner_id) ?? null,
      genre_label: p.genre?.label_ko ?? null,
      region_label: p.region_text ?? p.region?.label_ko ?? null,
      session_count: sessionMap.get(p.id) ?? 0,
    };
  });

  const canCreate = profile?.can_create_project || profile?.is_admin;
  // 헤더 "모집 중" 카운트는 만료되지 않은 공고 기준 (만료는 기본 숨김).
  const activeCount = enriched.filter(
    (p) => !isExpired(p.application_deadline, p.is_standing_pool),
  ).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-none tracking-tight">
            Casting
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-3">
            {activeCount} 모집 중
          </p>
        </div>
        {canCreate ? (
          <Link href="/projects/new">
            <Button size="sm" className="rounded-full">
              + 개설
            </Button>
          </Link>
        ) : !profile ? (
          <div className="flex gap-1.5">
            <Link href="/login?next=/feed">
              <Button size="sm" variant="outline" className="rounded-full">
                로그인
              </Button>
            </Link>
            <Link href="/signup?next=/feed">
              <Button size="sm" className="rounded-full">
                가입
              </Button>
            </Link>
          </div>
        ) : null}
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">
            아직 공개된 프로젝트가 없습니다.
          </p>
        </div>
      ) : (
        <ProjectListView projects={enriched} isAdmin={isAdmin} />
      )}
    </div>
  );
}

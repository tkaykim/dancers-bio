import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/guard";
import { DirectoryClient } from "@/components/directory/DirectoryClient";
import { getLocale, serverT } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/t";
import meta from "@/lib/i18n/messages/meta";
import directory from "@/lib/i18n/messages/directory";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = translator(meta, locale);
  const d = translator(directory, locale);
  const title = m("dancers.title");
  const description = m("dancers.description");
  return {
    title: { absolute: title },
    description,
    keywords: d("meta.keywords").split(","),
    alternates: { canonical: "https://deetz.kr/dancers" },
    openGraph: {
      title,
      description,
      url: "https://deetz.kr/dancers",
      siteName: "deetz",
      type: "website",
    },
  };
}

const PAGE_SIZE = 24;

type Tab = "dancers" | "teams";

type OwnDancer = {
  id: string;
  slug: string | null;
  stage_name: string;
  is_active: boolean;
};

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const params = await searchParams;
  const initialTab: Tab = params.tab === "teams" ? "teams" : "dancers";
  const supabase = await createClient();
  const user = await getUser();
  const t = await serverT(directory);

  const [dancersRes, teamsRes, dancerCountRes, teamCountRes, ownDancersRes] =
    await Promise.all([
      // 내부 경력점수 내림차순 정렬. RPC(SECURITY DEFINER)가 점수를 노출하지 않고
      // 정렬만 수행하고 공개 컬럼만 반환한다. (브라우즈 40 하드캡 포함)
      supabase.rpc("list_directory_dancers", {
        _limit: PAGE_SIZE,
        _offset: 0,
        _q: "",
      }),
      supabase
        .from("teams")
        .select(
          "id, team_name, korean_name, slug, profile_img, location, genres, specialties",
        )
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1),
      // dancers 카운트도 DEFINER RPC 로 (anon 은 테이블 직접접근이 RLS 로 차단됨)
      supabase.rpc("count_directory_dancers", { _q: "" }),
      supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .eq("is_active", true),
      user
        ? supabase
            .from("dancers")
            .select("id, slug, stage_name, is_active")
            .eq("profile_id", user.id)
            .order("created_at", { ascending: true })
            .limit(10)
        : Promise.resolve({ data: [] as OwnDancer[] }),
    ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-6xl lg:px-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          {t("header.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight lg:text-3xl">
          {t("header.title")}
        </h1>
      </header>

      <DirectoryClient
        initialDancers={dancersRes.data ?? []}
        initialTeams={teamsRes.data ?? []}
        initialTab={initialTab}
        totalDancers={Number(dancerCountRes.data ?? 0)}
        totalTeams={teamCountRes.count ?? 0}
        isLoggedIn={!!user}
        ownDancers={(ownDancersRes.data ?? []) as OwnDancer[]}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DirectoryClient } from "@/components/directory/DirectoryClient";

export const metadata: Metadata = {
  title: "댄서·댄스팀 포트폴리오 디렉토리 | deetz(디츠)",
  description:
    "디츠(deetz)에서 검증된 댄서와 댄스팀의 경력·영상 포트폴리오를 확인하세요. 댄서 섭외, 댄스팀 섭외, 안무가 섭외에 맞는 프로필을 비교하고 캐스팅할 수 있는 댄서 플랫폼입니다.",
  keywords: [
    "댄서 포트폴리오",
    "댄스팀 섭외",
    "댄서 섭외",
    "댄서 플랫폼",
    "안무가 섭외",
    "K-POP 댄서",
    "디츠",
    "deetz",
  ],
  alternates: { canonical: "https://deetz.kr/dancers" },
  openGraph: {
    title: "댄서·댄스팀 포트폴리오 디렉토리 | deetz(디츠)",
    description:
      "검증된 댄서·댄스팀의 경력과 영상 포트폴리오를 확인하고 댄서 섭외·캐스팅에 활용하세요.",
    url: "https://deetz.kr/dancers",
    siteName: "deetz",
    type: "website",
  },
};

const PAGE_SIZE = 24;

type Tab = "dancers" | "teams";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const params = await searchParams;
  const initialTab: Tab = params.tab === "teams" ? "teams" : "dancers";
  const supabase = await createClient();

  const [dancersRes, teamsRes, dancerCountRes, teamCountRes] = await Promise.all([
    // 내부 경력점수 내림차순 정렬. RPC(SECURITY DEFINER)가 점수를 노출하지 않고
    // 정렬만 수행하고 공개 컬럼만 반환한다.
    supabase.rpc("list_directory_dancers", { _limit: PAGE_SIZE, _offset: 0, _q: "" }),
    supabase
      .from("teams")
      .select(
        "id, team_name, korean_name, slug, profile_img, location, genres, specialties",
      )
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("dancers")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "approved")
      .eq("is_active", true),
    supabase
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "approved")
      .eq("is_active", true),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 디렉토리
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          댄서 / 팀 찾기
        </h1>
      </header>

      <DirectoryClient
        initialDancers={dancersRes.data ?? []}
        initialTeams={teamsRes.data ?? []}
        initialTab={initialTab}
        totalDancers={dancerCountRes.count ?? 0}
        totalTeams={teamCountRes.count ?? 0}
      />
    </div>
  );
}

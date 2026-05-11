import { createClient } from "@/lib/supabase/server";
import { DirectoryClient } from "@/components/directory/DirectoryClient";

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

  const [dancersRes, teamsRes] = await Promise.all([
    supabase
      .from("dancers")
      .select(
        "id, stage_name, korean_name, slug, profile_img, location, genres, specialties, profile_id",
      )
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .order("display_order", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("teams")
      .select(
        "id, team_name, korean_name, slug, profile_img, location, genres, specialties",
      )
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
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
      />
    </div>
  );
}

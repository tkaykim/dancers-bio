import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { SearchSection } from "./SearchSection";

type DancerResult = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  approval_status: string | null;
};

export default async function AddDancerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  await requireUser();
  const { role = "self", q = "" } = await searchParams;
  const resolvedRole: "self" | "manager" = role === "manager" ? "manager" : "self";

  let results: DancerResult[] = [];
  const trimmedQ = q.trim();
  if (trimmedQ.length >= 1) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("dancers")
      .select("id, stage_name, korean_name, slug, profile_img, approval_status")
      .is("profile_id", null)
      .eq("is_active", true)
      .ilike("stage_name", `%${trimmedQ}%`)
      .order("stage_name", { ascending: true })
      .limit(10);
    results = (data ?? []) as DancerResult[];
  }

  return (
    <SearchSection
      role={resolvedRole}
      q={trimmedQ}
      results={results}
    />
  );
}

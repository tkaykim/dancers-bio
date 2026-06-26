import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/safeRedirect";
import { SearchSection } from "./SearchSection";

type DancerResult = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
};

const PAGE_SIZE = 24;

export default async function AddDancerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; returnTo?: string }>;
}) {
  await requireUser();
  const { role = "self", returnTo } = await searchParams;
  const resolvedRole: "self" | "manager" = role === "manager" ? "manager" : "self";
  const safeReturn = returnTo ? safeReturnTo(returnTo, "") : "";

  // SSR: claim 가능한 큐레이션 댄서 첫 페이지 + 총 카운트.
  // (검색·페이지네이션은 클라이언트에서 debounced 호출)
  const supabase = await createClient();
  const [{ data: firstPage }, { count }] = await Promise.all([
    supabase
      .from("dancers")
      .select("id, stage_name, korean_name, slug, profile_img, genres")
      .is("profile_id", null)
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .or("is_verified.eq.false,is_verified.is.null")
      .order("stage_name", { ascending: true })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("dancers")
      .select("id", { count: "exact", head: true })
      .is("profile_id", null)
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .or("is_verified.eq.false,is_verified.is.null"),
  ]);

  return (
    <SearchSection
      role={resolvedRole}
      initialDancers={(firstPage ?? []) as DancerResult[]}
      totalCount={count ?? 0}
      returnTo={safeReturn || null}
    />
  );
}

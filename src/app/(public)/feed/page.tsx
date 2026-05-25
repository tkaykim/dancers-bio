import Link from "next/link";
import { getProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectListView } from "@/components/project/ProjectListView";

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
       application_deadline, created_at, owner_id, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .order("application_deadline", { ascending: true, nullsFirst: false })
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
          .from("project_sessions")
          .select("project_id, starts_at")
          .in("project_id", projectIds)
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
      created_at: p.created_at,
      owner_name: ownerMap.get(p.owner_id) ?? null,
      genre_label: p.genre?.label_ko ?? null,
      region_label: p.region_text ?? p.region?.label_ko ?? null,
      session_count: sessionMap.get(p.id) ?? 0,
    };
  });

  const canCreate = profile?.can_create_project || profile?.is_admin;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-none tracking-tight">
            Casting
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-3">
            {enriched.length} 모집 중
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

import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  ProjectCard,
  FeaturedCard,
} from "@/components/project/ProjectCard";

function pickFeatured<T extends { application_deadline: string | null }>(
  list: T[],
): T | undefined {
  const cutoff = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return list.find(
    (p) =>
      p.application_deadline &&
      new Date(p.application_deadline).getTime() < cutoff,
  );
}

type Row = {
  id: string;
  short_code: string | null;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: string;
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
  await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: rawProjects } = await supabase
    .from("projects")
    .select(
      `id, short_code, title, description, visibility, status, pay_amount, pay_type,
       application_deadline, created_at, owner_id, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("visibility", "public")
    .eq("status", "open")
    .is("deleted_at", null)
    .order("application_deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

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

  const enriched = projects.map((p) => ({
    id: p.id,
    short_code: p.short_code,
    title: p.title,
    description: p.description,
    visibility: p.visibility,
    status: p.status,
    pay_amount: p.pay_amount,
    pay_type: p.pay_type,
    application_deadline: p.application_deadline,
    created_at: p.created_at,
    owner_name: ownerMap.get(p.owner_id) ?? null,
    genre_label: p.genre?.label_ko ?? null,
    region_label: p.region_text ?? p.region?.label_ko ?? null,
    session_count: sessionMap.get(p.id) ?? 0,
  }));

  const featured = pickFeatured(enriched);
  const regular = enriched.filter((p) => p.id !== featured?.id);

  const canCreate = profile?.can_create_project || profile?.is_admin;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
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
        ) : null}
      </header>

      {canCreate ? (
        <Link
          href="/projects/new"
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 transition-colors hover:bg-primary/15 active:bg-primary/20"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold leading-none text-primary-foreground"
            >
              +
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">새 캐스팅 공고 개설</p>
              <p className="text-xs text-ink-2">
                제목·일정·페이만 입력하면 바로 공유 가능한 링크가 생성됩니다.
              </p>
            </div>
          </div>
          <span aria-hidden className="text-base text-ink-3">→</span>
        </Link>
      ) : null}

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">
            아직 공개된 프로젝트가 없습니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {featured ? <FeaturedCard project={featured} /> : null}
          {regular.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

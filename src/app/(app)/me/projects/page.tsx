import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import {
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";

type ProjectRow = {
  id: string;
  title: string;
  status: keyof typeof STATUS_LABELS;
  visibility: "public" | "private";
  recruitment_count: number;
  application_deadline: string | null;
  created_at: string;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

export default async function MyProjectsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: projectsData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("can_create_project, is_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select(
        "id, title, status, visibility, recruitment_count, application_deadline, created_at",
      )
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const projects = (projectsData ?? []) as ProjectRow[];
  const canCreate = !!profile?.can_create_project || !!profile?.is_admin;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 내 프로필
      </Link>

      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 내 공고</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            등록한 캐스팅 공고
          </h1>
        </div>
        {canCreate ? (
          <Link href="/projects/new">
            <Button size="sm">+ 새 공고</Button>
          </Link>
        ) : null}
      </header>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-ink-2">등록한 공고가 없습니다.</p>
          {canCreate ? (
            <Link href="/projects/new">
              <Button size="lg">첫 공고 만들기 →</Button>
            </Link>
          ) : (
            <Link
              href="/verify-instagram"
              className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
            >
              본인인증 후 공고 개설 가능 →
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => {
            const dDay = daysUntil(p.application_deadline);
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold leading-snug">
                      {p.title}
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-2">
                        {STATUS_LABELS[p.status]}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {VISIBILITY_LABELS[p.visibility]}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-2">
                        모집 {p.recruitment_count}명
                      </span>
                      {dDay !== null ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-2">
                          {dDay === 0 ? "오늘 마감" : `D-${dDay}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight size={18} className="mt-1 text-ink-3" aria-hidden />
                </Link>
                <div className="flex gap-2">
                  <Link href={`/projects/${p.id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      수정
                    </Button>
                  </Link>
                  <Link href={`/projects/${p.id}/applicants`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      지원자
                    </Button>
                  </Link>
                  <div className="flex-1">
                    <DeleteProjectButton
                      projectId={p.id}
                      variant="ghost"
                      size="sm"
                      label="삭제"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

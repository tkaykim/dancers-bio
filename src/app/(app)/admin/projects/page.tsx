import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { deadlineLabel } from "@/lib/utils/deadline";
import {
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";

type ProjectRow = {
  id: string;
  short_code: string;
  title: string;
  status: keyof typeof STATUS_LABELS;
  visibility: "public" | "private";
  recruitment_count: number;
  application_deadline: string | null;
  created_at: string;
  posted_by_label: string | null;
};


export default async function AdminProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: projectsData } = await supabase
    .from("projects")
    .select(
      "id, short_code, title, status, visibility, recruitment_count, application_deadline, created_at, posted_by_label",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const projects = (projectsData ?? []) as ProjectRow[];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>

      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 프로젝트</p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            공고 관리
          </h1>
        </div>
        <Link href="/projects/new">
          <Button size="sm">+ 새 공고</Button>
        </Link>
      </header>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-ink-2">등록된 공고가 없습니다.</p>
          <Link href="/projects/new">
            <Button size="lg">첫 공고 만들기 →</Button>
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => {
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <Link
                  href={`/projects/${p.short_code}`}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold leading-snug">
                      {p.title}
                    </h2>
                    {p.posted_by_label ? (
                      <p className="text-xs text-ink-3">{p.posted_by_label}</p>
                    ) : null}
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
                      {p.application_deadline ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-2">
                          {deadlineLabel(p.application_deadline, {
                            today: "오늘 마감",
                            past: "마감 지남",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight size={18} className="mt-1 text-ink-3" aria-hidden />
                </Link>
                <div className="flex gap-2">
                  <Link href={`/projects/${p.short_code}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      수정
                    </Button>
                  </Link>
                  <Link
                    href={`/projects/${p.short_code}/applicants`}
                    className="flex-1"
                  >
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

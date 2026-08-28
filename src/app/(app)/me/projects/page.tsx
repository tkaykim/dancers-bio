import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { requireUser } from "@/lib/auth/guard";
import { listManagedProjects } from "@/lib/projects/managed";

export const dynamic = "force-dynamic";
export const metadata = { title: "내가 관리하는 공고 | deetz" };

export default async function MyManagedProjectsPage() {
  const user = await requireUser();
  const projects = await listManagedProjects(user.id);

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-8 lg:mx-auto lg:max-w-2xl">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          내 정보
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">내가 관리하는 공고</h1>
        <p className="mt-1 text-sm text-ink-3">
          소유하거나 공동관리자로 지정된 공고 목록이에요.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">관리 중인 공고가 없습니다.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {projects.map((mp) => (
            <li key={mp.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/projects/${mp.short_code ?? mp.id}/applicants`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors active:bg-secondary"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-foreground">{mp.title}</span>
                  <span className="text-xs text-ink-3">
                    {mp.status === "open" ? "모집 중 · 지원자 보기" : "마감 · 지원자 보기"}
                  </span>
                </div>
                <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

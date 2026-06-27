import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 단톡방 공유용 공지 페이지. /n/<project.short_code>
// '전체에게'(public) 로 발행된 공지만 노출 — 로그인 불필요, 읽기 전용.
export default async function ProjectNoticePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title")
    .eq("short_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const { data: annRows } = await admin
    .from("project_announcements")
    .select("id, title, body, pinned, created_at")
    .eq("project_id", project.id as string)
    .is("deleted_at", null)
    .contains("audiences", ["public"])
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const announcements = (annRows ?? []) as Array<{
    id: string;
    title: string | null;
    body: string;
    pinned: boolean;
    created_at: string;
  }>;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <DeetzLogo className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">공지사항</h1>
        <p className="text-sm text-ink-2">{project.title as string}</p>
      </div>

      {announcements.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-ink-2">
          아직 공개된 공지가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {a.pinned ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    고정
                  </span>
                ) : null}
                {a.title ? (
                  <p className="text-sm font-bold">{a.title}</p>
                ) : null}
                <span className="text-[11px] text-ink-3">
                  {new Intl.DateTimeFormat("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Seoul",
                  }).format(new Date(a.created_at))}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                {a.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-[11px] text-ink-3">
        deetz 프로젝트 공지
      </p>
    </div>
  );
}

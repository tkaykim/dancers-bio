import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project/ProjectForm";

export default async function NewProjectPage() {
  const profile = await requireProfile();

  // 프로젝트 개설은 생성권한(can_create_project) 보유자 또는 슈퍼관리자.
  if (!profile.can_create_project && !profile.is_admin) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 전용
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          접근 권한이 없습니다
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          캐스팅 공고 등록은 프로젝트 매니저 권한이 있는 계정만 가능합니다.
          공고 등록을 원하시면 운영팀에 문의해 주세요.
        </p>
        <Link
          href="/feed"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          캐스팅 피드 보기 →
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: genres } = await supabase
    .from("genres")
    .select("id, label_ko")
    .order("sort_order");

  if (!genres) redirect("/me");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 새 프로젝트</p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          캐스팅 공고 개설
        </h1>
        <p className="text-sm text-ink-2">
          제목, 설명, 일정을 입력하고 공개하면 피드에 노출됩니다.
        </p>
      </header>
      <ProjectForm genres={genres} />
    </div>
  );
}

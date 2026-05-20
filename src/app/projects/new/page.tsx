import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project/ProjectForm";

export default async function NewProjectPage() {
  const profile = await requireProfile();

  // Lite: 관리자만 프로젝트 개설 가능.
  if (!profile.is_admin) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 전용
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          접근 권한이 없습니다
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          이 베타에서는 관리자만 캐스팅 공고를 등록할 수 있어요.
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

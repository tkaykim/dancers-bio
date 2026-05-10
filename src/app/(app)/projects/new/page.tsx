import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project/ProjectForm";

export default async function NewProjectPage() {
  const profile = await requireProfile();

  if (!profile.can_create_project && !profile.is_admin) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 본인인증 필요
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          한 단계만 더
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          프로젝트를 개설하려면 인스타그램 DM 1회 본인 인증이 필요합니다.
          관리자가 수동으로 검토하며 보통 1영업일 이내 처리됩니다.
        </p>
        <Link
          href="/verify-instagram"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          본인인증 시작 →
        </Link>
        <Link
          href="/me"
          className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
        >
          ← 내 프로필로
        </Link>
      </div>
    );
  }

  // Provide lookups for genre select (region is a free-text field now).
  const supabase = await createClient();
  const { data: genres } = await supabase
    .from("genres")
    .select("id, label_ko")
    .order("sort_order");

  // Hard fail if lookup missing — should never happen post-Phase 0a
  if (!genres) redirect("/me");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 새 프로젝트
        </p>
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

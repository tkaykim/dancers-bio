import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project/ProjectForm";
import { intakeDb } from "@/lib/project-intake/db";
import { projectDraftSchema } from "@/lib/project-intake/schema";
import { intakeFormDefaults } from "@/lib/project-intake/prefill";
import { notFound } from "next/navigation";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ intake?: string }>;
}) {
  const profile = await requireProfile();
  const { intake: intakeId } = await searchParams;
  if (intakeId && !profile.is_admin) notFound();

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
          캐스팅 공고 등록은 프로젝트 매니저 권한이 있는 계정만 가능합니다. 공고
          등록을 원하시면 운영팀에 문의해 주세요.
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
    .select("id, slug, label_ko")
    .order("sort_order");

  if (!genres) redirect("/me");
  const job =
    intakeId && /^[0-9a-f-]{36}$/i.test(intakeId)
      ? (
          await intakeDb()
            .from("project_intake_jobs")
            .select("id,revision,status,result,project_id")
            .eq("id", intakeId)
            .maybeSingle()
        ).data
      : null;
  if (intakeId && !job) notFound();
  if (job?.project_id) redirect(`/projects/${job.project_id}/edit`);
  const extracted = job
    ? projectDraftSchema.safeParse(job.result?.project)
    : null;
  if (job && !extracted?.success)
    redirect(`/admin/projects/intake?focus=${job.id}`);

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
          {job
            ? "원문에서 채운 내용입니다. 모든 항목을 수정한 뒤 공고 발행을 눌러 주세요."
            : "제목, 설명, 일정을 입력하고 공개하면 피드에 노출됩니다."}
        </p>
      </header>
      {job && job.result?.missing?.length > 0 && (
        <div className="rounded-xl border border-border p-4 text-sm">
          <p className="font-semibold">확인할 내용</p>
          <ul className="mt-2 list-disc pl-5">
            {job.result.missing.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {job && (
        <Link
          href={`/admin/projects/intake?focus=${job.id}`}
          className="text-sm underline"
        >
          원문·카드 초안 확인
        </Link>
      )}
      <ProjectForm
        key={job ? `${job.id}:${job.revision}` : "new"}
        genres={genres}
        initialValues={
          extracted?.success
            ? intakeFormDefaults(extracted.data, genres)
            : undefined
        }
        intake={job ? { id: job.id, revision: job.revision } : undefined}
      />
    </div>
  );
}

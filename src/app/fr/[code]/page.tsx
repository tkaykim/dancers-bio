import Link from "next/link";
import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import { QuickFitForm } from "@/components/portfolio/QuickFitForm";

// 로그인 공유링크(단톡방/공지용) 의상 사이즈 수집. /fr/<project short_code>
// 신원확인 = 로그인 세션(본인 댄서 자동 매칭). 한 링크를 다 같이 뿌린다.
export default async function FitRosterPage({
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
  const projectId = project.id as string;

  const user = await getUser();
  let dancerId: string | null = null;
  let name = "댄서";
  let prior: { top: string | null; waist: string | null; length: string | null } = {
    top: null,
    waist: null,
    length: null,
  };
  if (user) {
    dancerId = await resolveDancerIdForUserInProject(projectId, user.id);
    if (dancerId) {
      const [{ data: d }, { data: pi }] = await Promise.all([
        admin.from("dancers").select("stage_name").eq("id", dancerId).maybeSingle(),
        admin
          .from("dancer_private_info")
          .select("top_size, pants_waist_inch, pants_length_cm")
          .eq("dancer_id", dancerId)
          .maybeSingle(),
      ]);
      name = (d?.stage_name as string | null) ?? "댄서";
      prior = {
        top: (pi?.top_size as string | null) ?? null,
        waist: (pi?.pants_waist_inch as string | null) ?? null,
        length: (pi?.pants_length_cm as string | null) ?? null,
      };
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/fr/${code}`)}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <DeetzLogo className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">
          의상 사이즈를 입력해 주세요
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          {project.title as string}
          <br />
          신발은 검정색으로 준비해 본인이 직접 신고 오시면 됩니다.
        </p>
      </div>

      {!user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            입력하려면 deetz 로그인이 필요합니다.
            <br />
            지원하신 계정으로 로그인하시면 자동으로 본인 확인됩니다.
          </p>
          <Link
            href={loginHref}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            로그인하고 입력하기
          </Link>
        </div>
      ) : dancerId ? (
        <QuickFitForm
          code={code}
          name={name}
          top={prior.top}
          waist={prior.waist}
          length={prior.length}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-5 text-center">
          <p className="text-sm font-semibold">
            이 프로젝트에 지원한 기록이 없어요.
          </p>
          <p className="text-xs text-ink-2">
            다른 계정으로 지원하셨다면 그 계정으로 다시 로그인해 주세요.
          </p>
          <Link href={loginHref} className="text-xs font-semibold text-primary underline">
            다른 계정으로 로그인
          </Link>
        </div>
      )}

      <p className="text-center text-[11px] text-ink-3">
        이 프로젝트 확정자만 입력할 수 있어요.
      </p>
    </div>
  );
}

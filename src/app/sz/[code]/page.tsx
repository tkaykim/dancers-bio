import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectSizeRows } from "@/lib/fit/size-rows";
import { SizeSummary } from "@/components/project/SizeSummary";

// 매 요청마다 최신 제출 반영.
export const dynamic = "force-dynamic";
// 검색 비노출(랜덤 코드 + noindex).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// 로그인 없이 클라이언트에게 공유하는 의상 사이즈 취합표. /sz/<size_share_code>
export default async function PublicSizesPage({
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
    .eq("size_share_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const rows = await getProjectSizeRows(project.id as string);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8 lg:max-w-6xl lg:px-8">
      <DeetzLogo className="h-7 w-auto" priority />
      <h1 className="text-xl font-bold leading-tight tracking-tight">
        의상 사이즈 취합
      </h1>
      <SizeSummary rows={rows} projectTitle={project.title as string} />
    </div>
  );
}

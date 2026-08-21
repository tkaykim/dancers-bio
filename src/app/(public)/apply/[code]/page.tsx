import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuickApplyForm } from "./QuickApplyForm";

/**
 * 로그인 없이 접수하는 공개 지원 페이지.
 *   /apply/<공고 short_code>
 *
 * 공고 상세(/feed)의 일반 지원 흐름은 로그인을 요구한다. 단발성으로 사람을 많이
 * 모아야 하는 공고는 그 단계에서 유입이 깎이므로, 이 페이지로 우회한다.
 * 접수 처리는 quickApplyAction 이 한다.
 */

export const dynamic = "force-dynamic";

async function loadProject(code: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select(
      "id, title, description, status, visibility, application_deadline, pay_amount, pay_type, region_text, recruitment_count, deleted_at",
    )
    .eq("short_code", code)
    .maybeSingle();
  if (!data || data.deleted_at || data.visibility !== "public") return null;
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const project = await loadProject(code);
  if (!project) return { title: "공고를 찾을 수 없습니다 | deetz" };
  return {
    title: `${project.title} | deetz 간편 접수`,
    description: "회원가입 없이 이름·연락처만으로 바로 접수할 수 있습니다.",
  };
}

export default async function QuickApplyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const project = await loadProject(code);
  if (!project) notFound();

  const closed =
    project.status !== "open" ||
    (project.application_deadline && new Date(project.application_deadline) < new Date());

  const deadlineLabel = project.application_deadline
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(new Date(project.application_deadline))
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-5 py-10">
      <div className="text-2xl font-extrabold tracking-tight text-neutral-900">
        deetz<span className="text-neutral-300">.</span>
      </div>

      <span className="mt-6 inline-block rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600">
        회원가입 없이 접수
      </span>

      <h1 className="mt-3 text-xl font-bold leading-snug text-neutral-900">{project.title}</h1>

      <dl className="mt-5 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm">
        {project.pay_amount ? (
          <Row label="페이">{`${project.pay_amount.toLocaleString()}원`}</Row>
        ) : null}
        {deadlineLabel ? <Row label="접수 마감">{deadlineLabel}</Row> : null}
        {project.region_text ? <Row label="지역">{project.region_text}</Row> : null}
      </dl>

      {closed ? (
        <p className="mt-8 rounded-xl bg-red-50 px-4 py-6 text-center text-base font-bold text-red-600">
          접수가 마감되었습니다.
        </p>
      ) : (
        <div className="mt-8">
          <QuickApplyForm code={code} />
        </div>
      )}

      {project.description ? (
        <section className="mt-10 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-bold text-neutral-900">공고 내용</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
            {project.description}
          </p>
        </section>
      ) : null}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{children}</dd>
    </div>
  );
}

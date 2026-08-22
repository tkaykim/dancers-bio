import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { localeFor } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";
import { QuickApplyForm } from "./QuickApplyForm";

/**
 * 로그인 없이 접수하는 공개 지원 페이지.
 *   /apply/<공고 short_code>
 *
 * 공고 상세(/feed)의 일반 지원 흐름은 로그인을 요구한다. 단발성으로 사람을 많이
 * 모아야 하는 공고는 그 단계에서 유입이 깎이므로, 이 페이지로 우회한다.
 * 접수 처리는 quickApplyAction 이 한다.
 *
 * 화면 문구는 공고 언어를 따라간다(@/lib/i18n) — 영문 공고면 라벨·안내도 영어로 나간다.
 */

export const dynamic = "force-dynamic";

async function loadProject(code: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select(
      "id, short_code, title, description, status, visibility, application_deadline, pay_amount, pay_type, region_text, recruitment_count, deleted_at, collect_casting_details, collect_applicant_fee, guide_url",
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
  const t = translator(await localeFor(project?.title, project?.description));
  if (!project) return { title: t("apply.meta.not_found") };
  return {
    title: t("apply.meta.title", { title: project.title }),
    description: t("apply.meta.description"),
  };
}

/** 마감 시각. 영문 공고에는 한국 시간이라는 걸 같이 보여준다. */
function formatDeadline(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
    ...(locale === "en" ? { timeZoneName: "short" as const } : {}),
  }).format(new Date(iso));
}

export default async function QuickApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const { code } = await params;
  // 모집채널을 타고 들어온 경우 share_code 가 붙어 온다. 유효성은 서버 액션이 다시 본다.
  const { channel: rawChannel } = await searchParams;
  const channel =
    (typeof rawChannel === "string" ? rawChannel : rawChannel?.[0])?.trim() || null;
  const project = await loadProject(code);
  if (!project) notFound();

  const locale = await localeFor(project.title, project.description);
  const t = translator(locale);

  const closed =
    project.status !== "open" ||
    (project.application_deadline && new Date(project.application_deadline) < new Date());

  // 상세 지원서·희망 단가를 받는 공고는 간편 접수 폼으로 담을 수 없다(서버 액션도 거부한다).
  // 폼을 보여주고 제출 뒤에 실패시키면 지원자는 이유도 모르고 이탈한다.
  const needsFullForm =
    !!project.collect_casting_details || !!project.collect_applicant_fee;

  const deadlineLabel = project.application_deadline
    ? formatDeadline(project.application_deadline, locale)
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-5 py-10">
      <div className="text-2xl font-extrabold tracking-tight text-neutral-900">
        deetz<span className="text-neutral-300">.</span>
      </div>

      <span className="mt-6 inline-block rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600">
        {t("apply.badge.no_signup")}
      </span>

      <h1 className="mt-3 text-xl font-bold leading-snug text-neutral-900">{project.title}</h1>

      <dl className="mt-5 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm">
        {project.pay_amount ? (
          <Row label={t("apply.row.pay")}>
            {t("apply.pay.krw", {
              amount: project.pay_amount.toLocaleString(locale === "en" ? "en-US" : "ko-KR"),
            })}
          </Row>
        ) : null}
        {deadlineLabel ? <Row label={t("apply.row.deadline")}>{deadlineLabel}</Row> : null}
        {project.region_text ? (
          <Row label={t("apply.row.region")}>{project.region_text}</Row>
        ) : null}
      </dl>

      {closed ? (
        <p className="mt-8 rounded-xl bg-red-50 px-4 py-6 text-center text-base font-bold text-red-600">
          {t("apply.closed")}
        </p>
      ) : needsFullForm ? (
        <div className="mt-8 rounded-2xl bg-neutral-50 px-5 py-6 text-sm leading-relaxed text-neutral-700">
          <p className="font-bold text-neutral-900">{t("apply.full_form.title")}</p>
          <p className="mt-2">{t("apply.full_form.body")}</p>
          <p className="mt-1">{t("apply.full_form.hint")}</p>
          <a
            href={`/login?redirect=${encodeURIComponent(`/projects/${project.short_code}?apply=1`)}`}
            className="mt-5 block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            {t("apply.full_form.cta")}
          </a>
        </div>
      ) : (
        <div className="mt-8">
          <QuickApplyForm
            code={code}
            channel={channel}
            guideUrl={project.guide_url ?? null}
            locale={locale}
          />
        </div>
      )}

      {project.description ? (
        <section className="mt-10 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-bold text-neutral-900">
            {t("apply.description_heading")}
          </h2>
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

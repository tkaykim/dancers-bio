import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSubmissionByToken } from "@/lib/submissions/lookup";
import { localeFor } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/messages";
import { SubmitPanel } from "@/components/submissions/SubmitPanel";

export const dynamic = "force-dynamic";

// 제출 링크는 검색에 노출되면 안 된다.
export async function generateMetadata(): Promise<Metadata> {
  // 토큰을 읽지 않는다 — 제목만 필요하고, 이 단계에서 DB 를 한 번 더 칠 이유가 없다.
  return {
    title: translator(await localeFor())("submit.meta.title"),
    robots: { index: false, follow: false },
  };
}

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sub = await loadSubmissionByToken(token);
  if (!sub) notFound();

  // 언어는 lookup 이 공고 본문을 보고 이미 정해 뒀다. 화면과 차단 사유가 같은 언어로 나간다.
  const t = translator(sub.locale);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          deetz
        </p>
        <h1 className="text-xl font-bold leading-snug">{t("submit.heading")}</h1>
        <p className="text-sm text-muted-foreground">{sub.projectTitle}</p>
      </header>

      {sub.open ? (
        <SubmitPanel
          token={sub.token}
          initialHandle={sub.instagramHandle}
          displayName={sub.displayName}
          alreadyUploadedName={sub.driveFileName}
          initialCollaborators={sub.collaboratorHandles}
          locale={sub.locale}
        />
      ) : (
        <div className="text-sm leading-relaxed text-red-600 dark:text-red-400">
          <p className="font-semibold">{t("submit.blocked.title")}</p>
          <p>{sub.reason}</p>
        </div>
      )}

      <footer className="mt-auto pt-6 text-xs text-muted-foreground">
        <p>{t("submit.footer.personal")}</p>
        <p>{t("submit.footer.no_share")}</p>
        <p className="mt-2">{t("submit.footer.contact")}</p>
      </footer>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSubmissionByToken } from "@/lib/submissions/lookup";
import { SubmitUploader } from "@/components/submissions/SubmitUploader";

export const dynamic = "force-dynamic";

// 제출 링크는 검색에 노출되면 안 된다.
export const metadata: Metadata = {
  title: "영상 제출 · deetz",
  robots: { index: false, follow: false },
};

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sub = await loadSubmissionByToken(token);
  if (!sub) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          deetz
        </p>
        <h1 className="text-xl font-bold leading-snug">영상 제출</h1>
        <p className="text-sm text-muted-foreground">{sub.projectTitle}</p>
      </header>

      <section className="rounded-xl border border-border p-4 text-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">제출자</dt>
            <dd className="font-medium">{sub.displayName ?? sub.instagramHandle}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">인스타그램</dt>
            <dd className="font-medium">{sub.instagramHandle}</dd>
          </div>
        </dl>
      </section>

      {sub.open ? (
        <SubmitUploader
          token={sub.token}
          instagramHandle={sub.instagramHandle}
          alreadyUploadedName={sub.driveFileName}
        />
      ) : (
        <div className="text-sm leading-relaxed text-red-600 dark:text-red-400">
          <p className="font-semibold">지금은 제출하실 수 없습니다.</p>
          <p>{sub.reason}</p>
        </div>
      )}

      <footer className="mt-auto pt-6 text-xs text-muted-foreground">
        <p>본인에게만 발급된 링크입니다.</p>
        <p>다른 분과 공유하지 말아 주세요.</p>
        <p className="mt-2">문의 contact@deetz.kr</p>
      </footer>
    </main>
  );
}

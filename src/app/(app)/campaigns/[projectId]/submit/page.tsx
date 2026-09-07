import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { checked, db } from "@/lib/campaign/repository";
import {
  loadSubmissions,
  ownParticipants,
} from "@/lib/campaign/submission-repository";
import {
  currentSubmissions,
  participantView,
  uploadLabels,
  uploadStatus,
} from "@/lib/campaign/submissions";
import { SubmissionForm } from "@/components/campaign/SubmissionForm";
import { date } from "@/components/campaign/ResultsReport";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "게시물 링크 제출 · deetz",
  robots: { index: false, follow: false },
};
export default async function SubmitPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser(),
    { projectId } = await params;
  const person = (await ownParticipants(user.id)).find(
    (p) => p.project_id === projectId,
  );
  if (!person) notFound();
  const project = checked(
    await db()
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!project) notFound();
  const data = participantView(await loadSubmissions(projectId), person.id),
    subs = currentSubmissions(data, person.id);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-8">
      <Link href="/applications" className="text-sm text-ink-3">
        ← 내 지원 현황
      </Link>
      <header className="space-y-2">
        <p className="text-sm text-ink-3">{project.title}</p>
        <h1 className="text-2xl font-bold">게시물 링크 제출</h1>
        <p className="font-medium">
          {person.display_name} · {uploadLabels[uploadStatus(data, person.id)]}
        </p>
        <p className="text-sm text-ink-2">
          마감 {date(person.deadline ?? data.settings.deadline)}
        </p>
      </header>
      {person.ig_handle && (
        <p className="text-sm text-ink-3">등록 계정 @{person.ig_handle}</p>
      )}
      {subs.map((s) => (
        <section
          key={`${s.id}-${s.version}`}
          className="space-y-3 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <strong>{uploadLabels[s.status]}</strong>
            <a
              href={data.posts.find((p) => p.id === s.post_id)?.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              게시물 보기 ↗
            </a>
          </div>
          <p className="text-xs text-ink-3">
            {s.source === "admin"
              ? "관리자가 대신 등록했습니다."
              : "본인이 제출했습니다."}
            <br />
            접수 {date(s.submitted_at)}
            {s.reviewed_at && (
              <>
                <br />
                검토 {date(s.reviewed_at)}
              </>
            )}
          </p>
          {s.feedback && (
            <p className="whitespace-pre-line rounded-lg bg-secondary p-3 text-sm">
              {s.feedback}
            </p>
          )}
          {data.posts.some(
            (p) =>
              p.id === s.post_id && ["removed", "excluded"].includes(p.status),
          ) && (
            <p role="status" className="text-sm text-amber-700">
              이 게시물의 공개 상태를 다시 확인해야 합니다. 새 링크를 제출하거나
              담당자에게 문의해 주세요.
            </p>
          )}
          <details open={s.status === "changes_requested"}>
            <summary className="cursor-pointer text-sm font-semibold">
              {s.status === "approved" ? "변경 요청" : "링크 수정·재검토"}
            </summary>
            <div className="mt-4">
              <SubmissionForm
                projectId={projectId}
                participantId={person.id}
                submission={s}
                initialUrl={
                  data.posts.find((p) => p.id === s.post_id)?.post_url
                }
              />
            </div>
          </details>
        </section>
      ))}
      <details
        open={!subs.length}
        className="rounded-2xl border border-border bg-card p-5"
      >
        <summary className="cursor-pointer font-semibold">
          {subs.length
            ? "추가 게시물 제출"
            : "업로드한 게시물 링크를 붙여넣어 주세요."}
        </summary>
        <div className="mt-4">
          <SubmissionForm projectId={projectId} participantId={person.id} />
        </div>
      </details>
      <p className="text-xs leading-relaxed text-ink-3">
        마감이 지나도 링크를 제출할 수 있습니다.
        <br />
        같은 게시물의 캡션을 수정했다면 ‘링크 수정·재검토’를 눌러 다시 요청해
        주세요.
      </p>
    </main>
  );
}

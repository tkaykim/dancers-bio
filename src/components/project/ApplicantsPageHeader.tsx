import Link from "next/link";

export function ApplicantsPageHeader({ title, projectId, projectCode, messagingEnabled }: {
  title: string;
  projectId: string;
  projectCode: string;
  messagingEnabled: boolean;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-3">
      <p className="text-xs font-medium text-ink-3">지원자 관리</p>
      <h1 className="min-w-0 break-keep text-xl font-bold leading-snug tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{title}</h1>
      <nav aria-label="프로젝트 관리" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        <Link href={`/projects/${projectCode}`} className="inline-flex min-h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-xs text-ink-2 hover:bg-secondary sm:px-3 sm:text-sm">← 공고 보기</Link>
        <Link href={`/tools/campaigns/${projectId}?tab=submissions`} className="inline-flex min-h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-lg border border-border px-2 text-xs font-medium hover:bg-secondary sm:px-3 sm:text-sm">업로드 관리</Link>
        {messagingEnabled ? <Link href={`/projects/${projectId}/messages`} className="inline-flex min-h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-lg border border-border px-2 text-xs font-medium hover:bg-secondary sm:px-3 sm:text-sm">메시지함</Link> : null}
      </nav>
    </header>
  );
}

import { listProjectIntakes } from "@/app/actions/project-intake";
import { IntakeConsole } from "./IntakeConsole";
import { intakeDb } from "@/lib/project-intake/db";
import Link from "next/link";
export default async function ProjectIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; focus?: string }>;
}) {
  const result = await listProjectIntakes();
  const params = await searchParams;
  const db = intakeDb();
  const source =
    params.source && /^[0-9a-f-]{36}$/i.test(params.source)
      ? (
          await db
            .from("project_ingestions")
            .select("source_raw")
            .eq("id", params.source)
            .maybeSingle()
        ).data
      : null;
  const { data: previous } = await db
    .from("project_ingestions")
    .select("id,created_at,parsed_json,status")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(10);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-ink-3">공고 준비</p>
        <h1 className="text-2xl font-bold">텍스트·캡처로 공고 만들기</h1>
        <p className="mt-2 text-sm text-ink-2">
          원문을 넣으면 공고 초안과 언어별 카드 2장을 준비합니다.
          <br />
          기존 공고등록 양식에 내용이 채워지면 수정하고 직접 발행할 수 있습니다.
        </p>
      </header>
      <IntakeConsole
        initialJobs={result.ok ? result.jobs : []}
        initialError={result.ok ? "" : result.error}
        initialRaw={source?.source_raw ?? ""}
        focusId={params.focus}
      />
      {!!previous?.length && (
        <details>
          <summary className="cursor-pointer text-sm">
            이전에 수집한 공고 다시 불러오기
          </summary>
          <ul className="mt-3 space-y-2">
            {previous.map((row) => (
              <li key={row.id}>
                <Link
                  className="text-sm underline"
                  href={`/admin/projects/import/${row.id}`}
                >
                  {row.parsed_json?.title || "이전 수집 원문"}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

import { listProjectIntakes } from "@/app/actions/project-intake";
import { IntakeConsole } from "./IntakeConsole";
export default async function ProjectIntakePage() {
  const result = await listProjectIntakes();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-ink-3">공고 준비</p>
        <h1 className="text-2xl font-bold">텍스트·캡처로 공고 만들기</h1>
        <p className="mt-2 text-sm text-ink-2">
          원문을 넣으면 공고 초안과 언어별 카드 2장을 준비합니다.
          <br />
          내용을 검토한 뒤 임시저장으로 등록할 수 있습니다.
        </p>
      </header>
      <IntakeConsole
        initialJobs={result.ok ? result.jobs : []}
        initialError={result.ok ? "" : result.error}
      />
    </div>
  );
}

export function intakeProgress(job: {
  status: string;
  result: unknown;
  languages: string[];
  assets: unknown[];
  project_id?: string | null;
}) {
  const failed = job.status === "failed";
  const ready = ["review", "registered"].includes(job.status);
  const stage = ready
    ? 3
    : job.result
      ? 2
      : job.status === "processing"
        ? 1
        : 0;
  const labels = ["접수 대기", "내용 정리", "카드 제작", "준비 완료"];
  return {
    stage,
    failed,
    busy: ["queued", "processing"].includes(job.status),
    label: failed
      ? "확인 필요"
      : job.project_id && ready
        ? "공고 등록 완료"
        : labels[stage],
    detail: failed
      ? "다시 시도하거나 정리된 내용을 등록 양식에서 확인해 주세요."
      : stage === 0
        ? "처리기는 약 2분 간격으로 새 접수를 확인합니다. 이 화면은 자동으로 갱신됩니다."
        : stage === 1
          ? "원문과 캡처에서 제목·조건·페이·일정을 정리하고 있습니다."
          : stage === 2
            ? `등록 양식을 먼저 확인할 수 있습니다. 카드 ${job.assets.length}/${job.languages.length * 2}장을 준비했습니다.`
            : "내용을 수정하고 공고 발행 버튼을 눌러 주세요.",
    labels,
  };
}

// 지원 선발 단계 모델 (서버/클라이언트 공용 순수 함수).
//
// 공고가 자기 단계 수를 정하고(projects.selection_rounds, 1~3), 지원은 어디까지
// 통과했는지를 숫자로 들고 있는다(applications.passed_round). 상태값 enum 은 늘리지 않는다.
//
//   selection_rounds=1  대기 ─▶ 최종 합격
//   selection_rounds=2  대기 ─▶ 1차 합격 ─▶ 최종 합격
//   selection_rounds=3  대기 ─▶ 1차 합격 ─▶ 2차 합격 ─▶ 최종 합격
//
//   status        살아있나(pending/accepted) 끝났나(rejected/withdrawn/declined)
//   passed_round  통과한 단계 번호 (0 = 미통과)
//   confirmed_at  최종 합격 잠금 — 있으면 본인 포기 불가 (DB 트리거가 강제)
//
// 관련 마이그레이션: 20260815_004 / _005 / _006.

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export const MAX_SELECTION_ROUNDS = 3;

export type ApplicationStage =
  | "pending"
  | "in_progress" // 중간 단계 합격 (최종 아님)
  | "final" // 최종 합격
  | "rejected"
  | "withdrawn"
  | "declined";

export type ApplicationLike = {
  status: string | null;
  passed_round?: number | null;
  confirmed_at: string | null;
};

export type ProjectRoundConfig = {
  selection_rounds?: number | null;
  round_labels?: string[] | null;
};

// 공고별 단계 안내 메일 문구. 라운드 번호(문자열) → { body, note }.
// body 를 비우면 기본 문구가 나가고, note 는 경고 박스 아래에 덧붙는다.
// "최종 합격 아님" 경고는 여기서 덮어쓸 수 없다 — 코드 고정이다.
export type RoundMessage = { body?: string | null; note?: string | null };
export type RoundMessages = Record<string, RoundMessage>;

export function getRoundMessage(
  messages: unknown,
  round: number,
): RoundMessage {
  if (!messages || typeof messages !== "object") return {};
  const entry = (messages as RoundMessages)[String(round)];
  if (!entry || typeof entry !== "object") return {};
  return {
    body: typeof entry.body === "string" ? entry.body : null,
    note: typeof entry.note === "string" ? entry.note : null,
  };
}

// 여러 줄 입력을 문단 배열로. 빈 줄은 버린다.
export function toParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function normalizeRounds(rounds: number | null | undefined): number {
  const n = Number(rounds ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_SELECTION_ROUNDS);
}

export function getPassedRound(app: ApplicationLike): number {
  const raw = Number(app.passed_round ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  // 백필 이전 데이터 방어: accepted 인데 0 이면 최소 1차는 통과한 것으로 본다.
  if (raw === 0 && app.status === "accepted") return 1;
  return Math.trunc(raw);
}

export function getApplicationStage(app: ApplicationLike): ApplicationStage {
  switch (app.status) {
    case "accepted":
      return app.confirmed_at ? "final" : "in_progress";
    case "rejected":
      return "rejected";
    case "declined":
      return "declined";
    case "pending":
      return "pending";
    default:
      // withdrawn / expired / cancelled_by_* 는 "종료"로 묶는다.
      return "withdrawn";
  }
}

// n차 단계의 표시 이름. round_labels 가 있으면 그걸 쓰고, 없으면 기본 이름.
// 마지막 단계는 항상 "최종 합격" 계열로 읽히게 한다.
//
// locale 은 영문 공고 지원자에게 나가는 메일에서만 넘긴다. 운영자 화면은 기본값(ko).
// round_labels 는 운영자가 직접 쓴 값이라 언어와 무관하게 항상 우선한다.
export function roundLabel(
  round: number,
  project: ProjectRoundConfig | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const total = normalizeRounds(project?.selection_rounds);
  const custom = project?.round_labels?.[round - 1]?.trim();
  if (custom) return custom;
  if (round >= total) return t(locale, "stage.label.final");
  return t(locale, "stage.label.round", { round });
}

// 지원자·운영자 화면에 그대로 쓰는 라벨.
export function stageLabel(
  app: ApplicationLike,
  project: ProjectRoundConfig | null | undefined,
): string {
  const stage = getApplicationStage(app);
  const total = normalizeRounds(project?.selection_rounds);
  const passed = getPassedRound(app);

  switch (stage) {
    case "pending":
      return "검토 중";
    case "final":
      return roundLabel(total, project);
    case "in_progress":
      // 마지막 단계까지 올라왔는데 확정 도장이 안 찍힌 경우(레거시 데이터 포함).
      if (passed >= total) return "합격 (최종 확정 대기)";
      return roundLabel(passed, project);
    case "rejected":
      return "불합격";
    case "declined":
      return "본인 포기";
    case "withdrawn":
      return "지원 취소";
  }
}

// "1차 합격이 최종 합격이 아니다"를 말해야 하는 상황인지.
// 단계가 1개뿐인 공고에서는 이 문구가 오히려 혼란이라 띄우지 않는다.
export function needsNotFinalCaveat(
  app: ApplicationLike,
  project: ProjectRoundConfig | null | undefined,
): boolean {
  return (
    getApplicationStage(app) === "in_progress" &&
    normalizeRounds(project?.selection_rounds) > 1
  );
}

export function notFinalCaveat(
  app: ApplicationLike,
  project: ProjectRoundConfig | null | undefined,
): string {
  const total = normalizeRounds(project?.selection_rounds);
  const passed = getPassedRound(app);
  const next = Math.min(passed + 1, total);
  return `아직 최종 합격이 아닙니다. 다음 단계(${roundLabel(next, project)}) 결과에 따라 최종 진행이 되지 않을 수 있습니다.`;
}

// 본인 포기 — 최종 합격 전이면 어느 중간 단계에서든 가능.
export function canDeclineSelf(app: ApplicationLike): boolean {
  return getApplicationStage(app) === "in_progress";
}

// 검토 중 단계에서 지원 자체를 무르는 것(=지원 취소).
export function canWithdrawSelf(app: { status: string | null }): boolean {
  return app.status === "pending";
}

// 운영 콘솔에서 쓸 단계 목록 — [{round:1,label:"1차 합격"}, ...]
export function roundSteps(
  project: ProjectRoundConfig | null | undefined,
): Array<{ round: number; label: string; isFinal: boolean }> {
  const total = normalizeRounds(project?.selection_rounds);
  return Array.from({ length: total }, (_, i) => ({
    round: i + 1,
    label: roundLabel(i + 1, project),
    isFinal: i + 1 === total,
  }));
}

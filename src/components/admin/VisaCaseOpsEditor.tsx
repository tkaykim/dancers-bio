"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, ExternalLink, Loader2, Route } from "lucide-react";
import { updateVisaCaseOperationsAction } from "@/app/actions/visa";
import type { VisaAdminRow } from "@/components/admin/VisaAdminList";

const ANSWER_LABELS: Record<string, string> = {
  goal: "주요 목표",
  passportExpiry: "여권 만료일",
  visaExpiry: "현재 비자 만료일",
  residenceCountry: "현재 거주 국가",
  immigrationHistory: "출입국 이력 검토",
  auditionAvailability: "오디션 가능 일정",
  careerHighlights: "추가 주요 경력",
  contractReadiness: "계약 검토 준비",
  settlementNeeds: "정착 지원 필요",
  consultationTimezone: "시간대",
  consultationAvailability: "상담 가능 일정",
};

const ANSWER_VALUES: Record<string, string> = {
  new_visa: "신규 취업 비자",
  visa_change: "현재 비자 변경·연장",
  career: "한국 댄스 커리어",
  unsure: "경로 상담 필요",
  none: "없음",
  needs_review: "사전 검토 필요",
  private_consultation: "개별 상담 희망",
  ready: "준비됨",
  needs_translation: "번역본 필요",
  needs_explanation: "상세 설명 필요",
  housing: "주거",
  korean: "한국어",
  banking: "은행·휴대폰",
  transport: "입국·교통",
};

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => ANSWER_VALUES[String(item)] ?? String(item)).join(", ");
  if (typeof value === "boolean") return value ? "동의" : "동의 안 함";
  return ANSWER_VALUES[String(value)] ?? String(value ?? "-");
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function VisaCaseOpsEditor({ row }: { row: VisaAdminRow }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [auditionAt, setAuditionAt] = useState(toLocalDateTime(row.audition_at));
  const [auditionLocation, setAuditionLocation] = useState(row.audition_location ?? "");
  const [auditionStatus, setAuditionStatus] = useState(row.audition_status);
  const [auditionResult, setAuditionResult] = useState(row.audition_result);
  const [auditionFeedback, setAuditionFeedback] = useState(row.audition_feedback ?? "");
  const [levelTestVideoUrl, setLevelTestVideoUrl] = useState(row.level_test_video_url ?? "");
  const [trainingRequired, setTrainingRequired] = useState<"unknown" | "yes" | "no">(row.training_required == null ? "unknown" : row.training_required ? "yes" : "no");
  const [trainingPartner, setTrainingPartner] = useState(row.training_partner ?? "");
  const [trainingStartDate, setTrainingStartDate] = useState(row.training_start_date ?? "");
  const [trainingEndDate, setTrainingEndDate] = useState(row.training_end_date ?? "");
  const [trainingStatus, setTrainingStatus] = useState(row.training_status);
  const [evaluationAt, setEvaluationAt] = useState(toLocalDateTime(row.monthly_evaluation_at));
  const [evaluationResult, setEvaluationResult] = useState(row.monthly_evaluation_result);
  const [quotedPrice, setQuotedPrice] = useState(row.quoted_price_krw == null ? "" : String(row.quoted_price_krw));
  const [quoteNote, setQuoteNote] = useState(row.quote_note ?? "");
  const [nextAction, setNextAction] = useState(row.next_action ?? "");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(row.case_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("링크 복사에 실패했습니다.");
    }
  };

  const save = () => {
    setSaved(false);
    setError(null);
    const parsedPrice = quotedPrice.trim() ? Number(quotedPrice.replace(/,/g, "")) : null;
    if (parsedPrice != null && (!Number.isInteger(parsedPrice) || parsedPrice < 0)) {
      setError("최종 견적은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await updateVisaCaseOperationsAction({
        id: row.id,
        auditionAt: toIso(auditionAt),
        auditionLocation: nullable(auditionLocation),
        auditionStatus: auditionStatus as "not_scheduled" | "scheduled" | "completed" | "cancelled" | "no_show",
        auditionResult: auditionResult as "pending" | "pass" | "training_required" | "no_show",
        auditionFeedback: nullable(auditionFeedback),
        levelTestVideoUrl: nullable(levelTestVideoUrl),
        trainingRequired: trainingRequired === "unknown" ? null : trainingRequired === "yes",
        trainingPartner: nullable(trainingPartner),
        trainingStartDate: trainingStartDate || null,
        trainingEndDate: trainingEndDate || null,
        trainingStatus: trainingStatus as "not_required" | "planned" | "in_progress" | "completed" | "paused",
        monthlyEvaluationAt: toIso(evaluationAt),
        monthlyEvaluationResult: evaluationResult as "pending" | "pass" | "continue" | "hold",
        quotedPriceKrw: parsedPrice,
        quoteNote: nullable(quoteNote),
        nextAction: nullable(nextAction),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const answers = Object.entries(row.follow_up_answers ?? {}).filter(([key]) => !["processAcknowledged", "priceAcknowledged", "projectOpportunityOptIn"].includes(key));

  return (
    <div className="flex flex-col gap-5 border-t border-hairline-2 pt-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Route className="size-4 text-primary" />
          <p className="text-sm font-semibold">프로그램 케이스 운영</p>
        </div>
        <div className="flex gap-2">
          <input readOnly value={row.case_url} className="min-w-0 flex-1 rounded-lg border border-hairline-2 bg-surface-2 px-3 py-2 text-xs text-ink-2" />
          <button type="button" onClick={copyLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-2 px-3 py-2 text-xs font-medium hover:bg-secondary">
            {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
            {copied ? "복사됨" : "지원자 링크 복사"}
          </button>
          <a href={row.case_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-hairline-2 px-2.5 hover:bg-secondary" aria-label="지원자 페이지 열기">
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>

      {row.follow_up_submitted_at ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">추가 질문지 제출 완료</p>
            <span className="text-[11px] text-ink-3">{new Date(row.follow_up_submitted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
          </div>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            {answers.map(([key, value]) => (
              <div key={key} className={key === "auditionAvailability" || key === "careerHighlights" || key === "consultationAvailability" ? "md:col-span-2" : ""}>
                <dt className="text-[11px] text-ink-3">{ANSWER_LABELS[key] ?? key}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{text(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs font-medium">프로젝트 기회 안내: {row.project_opportunity_opt_in ? "희망" : "희망 안 함"}</p>
        </div>
      ) : (
        <p className="rounded-xl bg-secondary/60 px-4 py-3 text-xs text-ink-3">아직 추가 질문지를 제출하지 않았습니다.</p>
      )}

      <OpsGroup title="1. 오디션 레슨 · 영상 레벨테스트">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="오디션 일시"><input type="datetime-local" value={auditionAt} onChange={(e) => setAuditionAt(e.target.value)} className="admin-input" /></Input>
          <Input label="장소·방식"><input value={auditionLocation} onChange={(e) => setAuditionLocation(e.target.value)} placeholder="예: 서울 ○○스튜디오" className="admin-input" /></Input>
          <Input label="진행 상태"><select value={auditionStatus} onChange={(e) => setAuditionStatus(e.target.value)} className="admin-input"><option value="not_scheduled">미정</option><option value="scheduled">일정 확정</option><option value="completed">진행 완료</option><option value="cancelled">취소</option><option value="no_show">노쇼</option></select></Input>
          <Input label="레벨테스트 결과"><select value={auditionResult} onChange={(e) => setAuditionResult(e.target.value)} className="admin-input"><option value="pending">평가 대기</option><option value="pass">통과 → 비자 준비</option><option value="training_required">트레이닝 필요</option><option value="no_show">노쇼</option></select></Input>
          <Input label="결과 영상 URL" full><input value={levelTestVideoUrl} onChange={(e) => setLevelTestVideoUrl(e.target.value)} placeholder="https://" className="admin-input" /></Input>
          <Input label="평가 메모" full><textarea rows={3} value={auditionFeedback} onChange={(e) => setAuditionFeedback(e.target.value)} className="admin-input resize-none" /></Input>
        </div>
      </OpsGroup>

      <OpsGroup title="2. 조건부 전문 트레이닝">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="트레이닝 필요"><select value={trainingRequired} onChange={(e) => setTrainingRequired(e.target.value as "unknown" | "yes" | "no")} className="admin-input"><option value="unknown">미정</option><option value="yes">필요</option><option value="no">불필요</option></select></Input>
          <Input label="진행 상태"><select value={trainingStatus} onChange={(e) => setTrainingStatus(e.target.value)} className="admin-input"><option value="not_required">해당 없음</option><option value="planned">예정</option><option value="in_progress">수강 중</option><option value="completed">완료</option><option value="paused">중단·보류</option></select></Input>
          <Input label="제휴 학원·담당"><input value={trainingPartner} onChange={(e) => setTrainingPartner(e.target.value)} className="admin-input" /></Input>
          <div className="grid grid-cols-2 gap-2"><Input label="시작일"><input type="date" value={trainingStartDate} onChange={(e) => setTrainingStartDate(e.target.value)} className="admin-input" /></Input><Input label="종료 예정일"><input type="date" value={trainingEndDate} onChange={(e) => setTrainingEndDate(e.target.value)} className="admin-input" /></Input></div>
        </div>
      </OpsGroup>

      <OpsGroup title="3. 월말평가 · 비자 분기">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="월말평가 일시"><input type="datetime-local" value={evaluationAt} onChange={(e) => setEvaluationAt(e.target.value)} className="admin-input" /></Input>
          <Input label="월말평가 결과"><select value={evaluationResult} onChange={(e) => setEvaluationResult(e.target.value)} className="admin-input"><option value="pending">평가 대기</option><option value="pass">통과 → 비자 준비</option><option value="continue">트레이닝 계속</option><option value="hold">보류</option></select></Input>
          <Input label="다음 할 일" full><input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="예: 7/30 여권 사본 및 경력증명 요청" className="admin-input" /></Input>
        </div>
      </OpsGroup>

      <OpsGroup title="4. 비용 안내">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="기본 안내 단가"><input readOnly value={`${row.base_price_krw.toLocaleString()}원`} className="admin-input bg-secondary/60" /></Input>
          <Input label="상담 후 최종 견적"><input inputMode="numeric" value={quotedPrice} onChange={(e) => setQuotedPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="미확정" className="admin-input" /></Input>
          <Input label="견적 증감 사유·포함 범위" full><textarea rows={2} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} className="admin-input resize-none" /></Input>
        </div>
      </OpsGroup>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <button type="button" onClick={save} disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
        {saved ? "운영 정보 저장됨" : "운영 정보 저장"}
      </button>
      <style jsx>{`
        .admin-input { width: 100%; border: 1px solid var(--hairline-2); border-radius: 0.5rem; background: var(--surface-2); padding: 0.5rem 0.75rem; font-size: 0.8125rem; color: var(--foreground); outline: none; }
        .admin-input:focus { border-color: var(--primary); }
      `}</style>
    </div>
  );
}

function OpsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-hairline-2 p-4"><p className="mb-3 text-xs font-semibold text-ink-2">{title}</p>{children}</div>;
}

function Input({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={full ? "md:col-span-2" : ""}><span className="mb-1.5 block text-[11px] text-ink-3">{label}</span>{children}</label>;
}

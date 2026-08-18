"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToProjectAction } from "@/app/actions/applications";
import { NEEDS_DANCER_ERROR } from "@/lib/lite-constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  EMPTY_CASTING_APPLICATION_DEFAULTS,
  type CastingApplicationDefaults,
} from "@/lib/casting-application-details";
import type { NationalityOption } from "@/lib/nationality";

// Lite: 본인 own dancer 1개로만 지원. dancer 없으면 onboarding 유도.
const FEE_CURRENCIES = ["KRW", "USD", "JPY", "EUR"] as const;
const FEE_UNITS = ["회당", "일당", "건당", "총액"] as const;

export function ApplyForm({
  projectId,
  projectShortCode,
  hasDancer,
  collectFee = false,
  collectCastingDetails = false,
  castingDefaults = EMPTY_CASTING_APPLICATION_DEFAULTS,
  recruitmentChannelId,
  recruitmentChannelName,
  recruitmentChannelCode,
  nationalityOptions = [],
}: {
  /** UUID — server action에 전달되는 canonical id. */
  projectId: string;
  /** 6자 short_code — returnTo URL 등 외부 노출용. */
  projectShortCode: string;
  hasDancer: boolean;
  /** 이 공고가 지원자에게 단가를 받는지 (projects.collect_applicant_fee) */
  collectFee?: boolean;
  /** 이름·출생연도·키·주 장르·춤 영상·백업댄서 이력을 필수로 받는 공고. */
  collectCastingDetails?: boolean;
  /** 회원 프로필에서 미리 채운 값. 지원자가 제출 전 수정할 수 있다. */
  castingDefaults?: CastingApplicationDefaults;
  recruitmentChannelId?: string | null;
  recruitmentChannelName?: string | null;
  recruitmentChannelCode?: string | null;
  /** 공개 프로필에는 노출하지 않고, 지원서별 동의 시 담당자에게만 공개할 국적 목록. */
  nationalityOptions?: NationalityOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [needsDancer, setNeedsDancer] = useState<boolean>(!hasDancer);
  const [pending, startTransition] = useTransition();

  // 단가(견적) 입력 — collectFee 공고에서만 노출.
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCurrency, setFeeCurrency] = useState<string>("KRW");
  const [feeUnit, setFeeUnit] = useState<string>("회당");
  const [feeNegotiable, setFeeNegotiable] = useState(false);
  const [nationalityDisclosureConsent, setNationalityDisclosureConsent] =
    useState(false);

  function onFeeAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
    setFeeAmount(digits ? Number(digits).toLocaleString("ko-KR") : "");
  }

  if (needsDancer) {
    const params = new URLSearchParams({ apply: "1" });
    if (recruitmentChannelCode) params.set("channel", recruitmentChannelCode);
    const returnTo = encodeURIComponent(
      `/projects/${projectShortCode}?${params.toString()}`,
    );
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-ink-2">
          지원하려면 먼저 댄서 프로필이 필요합니다.
        </p>
        <p className="text-xs text-ink-3">
          30초만에 만들 수 있어요. 만들고 나면 이 공고로 자동 복귀합니다.
        </p>
        <a
          href={`/me/portfolio/add?returnTo=${returnTo}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          댄서 프로필 만들기 →
        </a>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setMessage(null);
        formData.set("project_id", projectId);
        if (recruitmentChannelId) {
          formData.set("recruitment_channel_id", recruitmentChannelId);
        }
        if (collectFee) {
          const normalizedFeeAmount = feeAmount.replace(/[^\d]/g, "");
          if (!normalizedFeeAmount) {
            setMessage({
              kind: "error",
              text: "러프한 금액이라도 제안 단가를 입력해 주세요.",
            });
            return;
          }
          formData.set("fee_amount", normalizedFeeAmount);
          formData.set("fee_currency", feeCurrency);
          formData.set("fee_unit", feeUnit);
          formData.set("fee_negotiable", feeNegotiable ? "1" : "");
        }
        startTransition(async () => {
          const result = await applyToProjectAction(formData);
          if (!result.ok) {
            if (result.error === NEEDS_DANCER_ERROR) {
              setNeedsDancer(true);
              return;
            }
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "지원이 완료됐습니다." });
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Label htmlFor="cover_message" className="text-xs uppercase tracking-[0.14em] text-ink-3">
        ↳ 한 줄 자기소개 (선택)
      </Label>
      {recruitmentChannelName ? (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-ink-2">
          모집채널: <span className="font-medium">{recruitmentChannelName}</span>
        </p>
      ) : null}
      <textarea
        id="cover_message"
        name="cover_message"
        rows={3}
        maxLength={500}
        placeholder="예: 무대 댄서 7년차, K-pop 다수 경험 보유. 빠른 캐치 자신 있어요."
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {collectCastingDetails ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            상세 지원 정보
          </legend>
          <p className="text-xs leading-relaxed text-ink-3">
            회원 프로필에 등록된 정보는 자동으로 불러왔습니다.
            비어 있거나 달라진 내용은 여기서 바로 수정해 제출해 주세요.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="applicant_name">이름 *</Label>
              <input
                id="applicant_name"
                name="applicant_name"
                required
                maxLength={100}
                defaultValue={castingDefaults.applicant_name}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birth_year">출생연도 *</Label>
              <input
                id="birth_year"
                name="birth_year"
                type="number"
                inputMode="numeric"
                required
                min={1900}
                max={new Date().getFullYear()}
                defaultValue={castingDefaults.birth_year}
                placeholder="예: 1998"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="height_cm">키(cm) *</Label>
              <input
                id="height_cm"
                name="height_cm"
                type="number"
                inputMode="numeric"
                required
                min={50}
                max={250}
                defaultValue={castingDefaults.height_cm}
                placeholder="예: 165"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primary_genre">주 장르 *</Label>
              <input
                id="primary_genre"
                name="primary_genre"
                required
                maxLength={100}
                defaultValue={castingDefaults.primary_genre}
                placeholder="예: K-POP, 코레오그래피"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dance_video_url">춤 영상 링크 *</Label>
            <input
              id="dance_video_url"
              name="dance_video_url"
              type="url"
              required
              maxLength={2000}
              defaultValue={castingDefaults.dance_video_url}
              placeholder="YouTube·Vimeo·Drive·SNS 영상 링크"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup_dancer_history">백업댄서 이력 *</Label>
            <textarea
              id="backup_dancer_history"
              name="backup_dancer_history"
              required
              rows={4}
              maxLength={2000}
              defaultValue={castingDefaults.backup_dancer_history}
              placeholder="아티스트·공연명·연도·역할을 적어 주세요. 경력이 없으면 '없음'이라고 입력해 주세요."
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="personal_profile_url">개인 프로필 링크 (보유 시)</Label>
            <input
              id="personal_profile_url"
              name="personal_profile_url"
              type="url"
              maxLength={2000}
              defaultValue={castingDefaults.personal_profile_url}
              placeholder="프로필 파일·소개 페이지·포트폴리오 링크"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </fieldset>
      ) : null}

      {collectFee ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-xs uppercase tracking-[0.14em] text-ink-3">
              ↳ 제안 단가 (필수)
            </Label>
            <span className="text-[11px] text-ink-3">운영자만 봅니다</span>
          </div>

          <p className="text-xs leading-5 text-ink-3">
            정확한 금액이 아니어도 괜찮습니다. 가능한 범위의 러프한 금액을 먼저 입력해 주세요.
          </p>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-md border border-input bg-background px-2">
              <select
                aria-label="통화"
                value={feeCurrency}
                onChange={(e) => setFeeCurrency(e.target.value)}
                className="bg-transparent py-2 pr-1 text-sm focus:outline-none"
              >
                {FEE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                inputMode="numeric"
                value={feeAmount}
                onChange={onFeeAmountChange}
                placeholder="예: 1,500,000"
                required={collectFee}
                className="h-9 w-full min-w-0 bg-transparent px-1 text-sm focus:outline-none"
              />
            </div>
            <select
              aria-label="단위"
              value={feeUnit}
              onChange={(e) => setFeeUnit(e.target.value)}
              className="w-20 rounded-md border border-input bg-background px-2 text-sm"
            >
              {FEE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={feeNegotiable}
              onChange={(e) => setFeeNegotiable(e.target.checked)}
              className="h-4 w-4"
            />
            입력한 금액을 기준으로 세부 조건은 협의 가능합니다.
          </label>
        </div>
      ) : null}

      {nationalityOptions.length > 0 ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            국적 공개 동의 (선택)
          </legend>
          <p className="text-xs leading-relaxed text-ink-3">
            공개 프로필에는 표시되지 않습니다. 이 지원서의 프로젝트 담당자에게만 아래 국적을 공개합니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nationalityOptions.map((item) => (
              <span
                key={item.code}
                className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {item.label}
              </span>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
            <input
              type="checkbox"
              name="nationality_disclosure_consent"
              value="true"
              checked={nationalityDisclosureConsent}
              onChange={(event) =>
                setNationalityDisclosureConsent(event.target.checked)
              }
              className="mt-0.5 size-4 shrink-0"
            />
            <span>이 지원서의 담당자에게 국적을 공개하는 데 동의합니다.</span>
          </label>
        </fieldset>
      ) : null}

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            "rounded-md px-3 py-2 text-sm " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "지원하는 중..." : "지원하기"}
      </Button>
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("지원을 취소하시겠습니까?")) return;
        const fd = new FormData();
        fd.set("application_id", applicationId);
        startTransition(async () => {
          const { withdrawApplicationAction } = await import("@/app/actions/applications");
          const result = await withdrawApplicationAction(fd);
          if (!result.ok) {
            alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "취소 중..." : "지원 취소"}
    </Button>
  );
}

// 1차 합격(최종 확정 전) 상태에서 본인이 참여를 포기한다.
// 최종 선발 이후에는 이 버튼 자체가 렌더되지 않고, 서버·DB 트리거도 전이를 막는다.
export function DeclineOfferButton({
  applicationId,
  requireReason = false,
}: {
  applicationId: string;
  /** 2차 이상 단계에서는 사유가 필수다(운영팀이 후속 충원을 판단해야 한다). */
  requireReason?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "이 프로젝트 참여를 포기하시겠습니까?\n포기하면 이번 캐스팅 검토 대상에서 제외되며, 되돌릴 수 없습니다.",
          )
        )
          return;
        const reason = (
          prompt(
            requireReason
              ? "포기 사유를 남겨주세요. (필수)"
              : "포기 사유를 남겨주세요. (선택)",
          ) ?? ""
        ).trim();
        if (requireReason && !reason) {
          alert("이 단계에서는 포기 사유를 남겨주셔야 합니다.");
          return;
        }
        const fd = new FormData();
        fd.set("application_id", applicationId);
        fd.set("reason", reason);
        startTransition(async () => {
          const { declineAcceptedApplicationAction } = await import(
            "@/app/actions/applications"
          );
          const result = await declineAcceptedApplicationAction(fd);
          if (!result.ok) {
            alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "처리 중..." : "참여 포기"}
    </Button>
  );
}

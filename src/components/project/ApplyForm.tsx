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
import { useLocale, useT } from "@/lib/i18n/provider";
import { localeTag } from "@/lib/i18n/t";
import project from "@/lib/i18n/messages/project";

// Lite: 본인 own dancer 1개로만 지원. dancer 없으면 onboarding 유도.
const FEE_CURRENCIES = ["KRW", "USD", "JPY", "EUR"] as const;
// 값은 DB(applications.fee_unit)에 그대로 저장되는 식별자다 — 번역하지 않고 라벨만 사전에서 읽는다.
// eslint-disable-next-line no-restricted-syntax -- i18n: 저장되는 데이터 값(라벨은 FEE_UNIT_KEYS)
const FEE_UNITS = ["회당", "일당", "건당", "총액"] as const;
const FEE_UNIT_KEYS = [
  "apply.fee_unit_session",
  "apply.fee_unit_day",
  "apply.fee_unit_job",
  "apply.fee_unit_total",
] as const;

export type ApplicationAvailabilitySchedule = {
  id: string;
  label: string;
  whenText: string;
};

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
  availabilitySchedules = [],
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
  /** 지원 단계에서 한 번에 가능여부를 받을 후보 일정. */
  availabilitySchedules?: ApplicationAvailabilitySchedule[];
}) {
  const collectsCompanionInstagram = projectShortCode === "7weep2";
  const t = useT(project);
  const locale = useLocale();
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // 지원 직후 바로 열어볼 제작 가이드. 확정 안내 메일을 기다리는 사이 이탈하는 걸 막는다.
  const [guideUrl, setGuideUrl] = useState<string | null>(null);
  const [needsDancer, setNeedsDancer] = useState<boolean>(!hasDancer);
  const [pending, startTransition] = useTransition();

  // 단가(견적) 입력 — collectFee 공고에서만 노출.
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCurrency, setFeeCurrency] = useState<string>("KRW");
  const [feeUnit, setFeeUnit] = useState<string>(FEE_UNITS[0]);
  const [feeNegotiable, setFeeNegotiable] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [nationalityDisclosureConsent, setNationalityDisclosureConsent] =
    useState(false);

  function onFeeAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
    setFeeAmount(digits ? Number(digits).toLocaleString(localeTag(locale)) : "");
  }

  if (needsDancer) {
    const params = new URLSearchParams({ apply: "1" });
    if (recruitmentChannelCode) params.set("channel", recruitmentChannelCode);
    const returnTo = encodeURIComponent(
      `/projects/${projectShortCode}?${params.toString()}`,
    );
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-ink-2">{t("apply.needs_dancer_title")}</p>
        <p className="text-xs text-ink-3">{t("apply.needs_dancer_hint")}</p>
        <a
          href={`/me/portfolio/add?returnTo=${returnTo}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("apply.needs_dancer_cta")}
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
        if (availabilitySchedules.length > 0 && selectedScheduleIds.length === 0) {
          setMessage({
            kind: "error",
            text: t("apply.error_schedule_required"),
          });
          return;
        }
        if (collectFee) {
          const normalizedFeeAmount = feeAmount.replace(/[^\d]/g, "");
          if (!normalizedFeeAmount) {
            setMessage({
              kind: "error",
              text: t("apply.error_fee_required"),
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
          setGuideUrl(result.data?.guideUrl ?? null);
          setMessage({
            kind: "ok",
            text: result.data?.accepted
              ? t("apply.success_accepted")
              : t("apply.success"),
          });
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Label htmlFor="cover_message" className="text-xs uppercase tracking-[0.14em] text-ink-3">
        {collectsCompanionInstagram
          ? t("apply.cover_label_companion")
          : t("apply.cover_label")}
      </Label>
      {collectsCompanionInstagram ? (
        <p className="text-xs leading-relaxed text-ink-3">
          {t("apply.companion_hint")}
        </p>
      ) : null}
      {recruitmentChannelName ? (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-ink-2">
          {t("apply.channel_label")}{" "}
          <span className="font-medium" data-ugc>
            {recruitmentChannelName}
          </span>
        </p>
      ) : null}
      <textarea
        id="cover_message"
        name="cover_message"
        rows={3}
        maxLength={500}
        placeholder={
          collectsCompanionInstagram
            ? t("apply.cover_placeholder_companion")
            : t("apply.cover_placeholder")
        }
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {availabilitySchedules.length > 0 ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            {t("apply.availability_legend")}
          </legend>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-5 text-ink-3">
              {t("apply.availability_hint")}
            </p>
            <button
              type="button"
              onClick={() =>
                setSelectedScheduleIds(
                  selectedScheduleIds.length === availabilitySchedules.length
                    ? []
                    : availabilitySchedules.map((schedule) => schedule.id),
                )
              }
              className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {selectedScheduleIds.length === availabilitySchedules.length
                ? t("apply.availability_clear_all")
                : t("apply.availability_select_all")}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {availabilitySchedules.map((schedule) => {
              const checked = selectedScheduleIds.includes(schedule.id);
              return (
                <label
                  key={schedule.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="availability_schedule_ids"
                    value={schedule.id}
                    checked={checked}
                    onChange={(event) =>
                      setSelectedScheduleIds((current) =>
                        event.target.checked
                          ? [...current, schedule.id]
                          : current.filter((id) => id !== schedule.id),
                      )
                    }
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-1" data-ugc>
                      {schedule.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {schedule.whenText}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {collectCastingDetails ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            {t("apply.casting_legend")}
          </legend>
          <p className="text-xs leading-relaxed text-ink-3">
            {t("apply.casting_hint")}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="applicant_name">{t("apply.name")}</Label>
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
              <Label htmlFor="birth_year">{t("apply.birth_year")}</Label>
              <input
                id="birth_year"
                name="birth_year"
                type="number"
                inputMode="numeric"
                required
                min={1900}
                max={new Date().getFullYear()}
                defaultValue={castingDefaults.birth_year}
                placeholder={t("apply.birth_year_placeholder")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="height_cm">{t("apply.height")}</Label>
              <input
                id="height_cm"
                name="height_cm"
                type="number"
                inputMode="numeric"
                required
                min={50}
                max={250}
                defaultValue={castingDefaults.height_cm}
                placeholder={t("apply.height_placeholder")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primary_genre">{t("apply.primary_genre")}</Label>
              <input
                id="primary_genre"
                name="primary_genre"
                required
                maxLength={100}
                defaultValue={castingDefaults.primary_genre}
                placeholder={t("apply.primary_genre_placeholder")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dance_video_url">{t("apply.dance_video")}</Label>
            <input
              id="dance_video_url"
              name="dance_video_url"
              type="url"
              required
              maxLength={2000}
              defaultValue={castingDefaults.dance_video_url}
              placeholder={t("apply.dance_video_placeholder")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup_dancer_history">
              {t("apply.backup_history")}
            </Label>
            <textarea
              id="backup_dancer_history"
              name="backup_dancer_history"
              required
              rows={4}
              maxLength={2000}
              defaultValue={castingDefaults.backup_dancer_history}
              placeholder={t("apply.backup_history_placeholder")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="personal_profile_url">
              {t("apply.personal_profile")}
            </Label>
            <input
              id="personal_profile_url"
              name="personal_profile_url"
              type="url"
              maxLength={2000}
              defaultValue={castingDefaults.personal_profile_url}
              placeholder={t("apply.personal_profile_placeholder")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </fieldset>
      ) : null}

      {collectFee ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-xs uppercase tracking-[0.14em] text-ink-3">
              {t("apply.fee_legend")}
            </Label>
            <span className="text-[11px] text-ink-3">{t("apply.fee_private")}</span>
          </div>

          <p className="text-xs leading-5 text-ink-3">{t("apply.fee_hint")}</p>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-md border border-input bg-background px-2">
              <select
                aria-label={t("apply.fee_currency")}
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
                placeholder={t("apply.fee_amount_placeholder")}
                required={collectFee}
                className="h-9 w-full min-w-0 bg-transparent px-1 text-sm focus:outline-none"
              />
            </div>
            <select
              aria-label={t("apply.fee_unit")}
              value={feeUnit}
              onChange={(e) => setFeeUnit(e.target.value)}
              className="w-20 rounded-md border border-input bg-background px-2 text-sm"
            >
              {FEE_UNITS.map((u, i) => (
                <option key={u} value={u}>
                  {t(FEE_UNIT_KEYS[i])}
                </option>
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
            {t("apply.fee_negotiable")}
          </label>
        </div>
      ) : null}

      {nationalityOptions.length > 0 ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            {t("apply.nationality_legend")}
          </legend>
          <p className="text-xs leading-relaxed text-ink-3">
            {t("apply.nationality_hint")}
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
            <span>{t("apply.nationality_consent")}</span>
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

      {/*
        지원 직후 제작 가이드를 이 자리에서 바로 연다.
        메일을 기다리게 하면 그 사이에 이탈한다.
      */}
      {guideUrl ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-semibold text-ink-1">{t("apply.guide_title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {t("apply.guide_body1")}
            <br />
            {t("apply.guide_body2")}
          </p>
          <a
            href={guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block rounded-lg bg-foreground px-4 py-3 text-center text-sm font-bold text-background"
          >
            {t("apply.guide_cta")}
          </a>
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? t("apply.submitting") : t("apply.submit")}
      </Button>
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const t = useT(project);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("withdraw.confirm"))) return;
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
      {pending ? t("withdraw.pending") : t("withdraw.label")}
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
  const t = useT(project);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("decline.confirm"))) return;
        const reason = (
          prompt(
            requireReason
              ? t("decline.reason_required")
              : t("decline.reason_optional"),
          ) ?? ""
        ).trim();
        if (requireReason && !reason) {
          alert(t("decline.reason_missing"));
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
      {pending ? t("decline.pending") : t("decline.label")}
    </Button>
  );
}

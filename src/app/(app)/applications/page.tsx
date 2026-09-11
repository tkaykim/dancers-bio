import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { ownParticipants } from "@/lib/campaign/submission-repository";
import { createClient } from "@/lib/supabase/server";
import {
  DeclineOfferButton,
  WithdrawButton,
} from "@/components/project/ApplyForm";
import { MessagesTextLink } from "@/components/messaging/MessagesBadge";
import { OpenThreadButton } from "@/components/messaging/OpenThreadButton";
import {
  getApplicationStage,
  getPassedRound,
  needsNotFinalCaveat,
  normalizeRounds,
  type ApplicationStage,
  type ProjectRoundConfig,
} from "@/lib/application-stage";
import { getLocale, serverT } from "@/lib/i18n/server";
import { labelFor } from "@/lib/i18n/labels";
import { tCount, translator, type KeyOf, type Translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import applications from "@/lib/i18n/messages/applications";
import labels from "@/lib/i18n/messages/labels";

type Row = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  passed_round: number | null;
  project: {
    id: string;
    short_code: string | null;
    title: string;
    pay_amount: number | null;
    pay_type: string | null;
    application_deadline: string | null;
    status: string;
    selection_rounds: number | null;
    round_labels: string[] | null;
  } | null;
};

type T = Translator<typeof applications>;
type TLabels = Translator<typeof labels>;

const CONTACT_EMAIL = "contact@deetz.kr";

const STAGE_STYLES: Record<ApplicationStage, { card: string; chip: string }> = {
  pending: { card: "border-border bg-card", chip: "bg-secondary text-ink-2" },
  in_progress: {
    card: "border-amber-500/40 bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  final: {
    card: "border-ok/40 bg-ok/5",
    chip: "bg-ok/15 text-ok",
  },
  rejected: { card: "border-border bg-card", chip: "bg-secondary text-ink-3" },
  withdrawn: { card: "border-border bg-card", chip: "bg-secondary text-ink-3" },
  declined: { card: "border-border bg-card", chip: "bg-secondary text-ink-3" },
};

// 진행 중인 것이 위로. 종료된 건은 아래로.
const GROUP_ORDER: ApplicationStage[] = [
  "final",
  "in_progress",
  "pending",
  "rejected",
  "declined",
  "withdrawn",
];

const GROUP_LABEL_KEYS: Record<ApplicationStage, KeyOf<typeof applications>> = {
  final: "group.final",
  in_progress: "group.in_progress",
  pending: "group.pending",
  rejected: "group.rejected",
  declined: "group.declined",
  withdrawn: "group.withdrawn",
};

/** 이름표 하나. `ugc` 면 운영자가 직접 쓴 값이라 언어 스윕에서 빼야 한다. */
type StageText = { text: string; ugc: boolean };

/**
 * 문장 안의 한 조각만 감싼다(링크·강조·이용자 글).
 * 문장을 조각 키로 쪼개면 어순이 다른 언어에서 깨지므로, 번역된 문장을 그리며 나눈다.
 */
function wrapPart(
  text: string,
  part: string,
  wrap: (s: string) => ReactNode,
): ReactNode {
  const at = part ? text.indexOf(part) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      {wrap(part)}
      {text.slice(at + part.length)}
    </>
  );
}

function ugcSpan(s: string) {
  return <span data-ugc="">{s}</span>;
}

/**
 * n차 단계의 표시 이름 — application-stage.ts 의 roundLabel() 과 같은 규칙을 언어별로 옮긴 것.
 * round_labels 는 운영자가 직접 쓴 값이라 언어와 무관하게 항상 우선한다.
 */
function roundLabelOf(
  round: number,
  project: ProjectRoundConfig | null | undefined,
  locale: Locale,
  tLabels: TLabels,
): StageText {
  const total = normalizeRounds(project?.selection_rounds);
  const custom = project?.round_labels?.[round - 1]?.trim();
  if (custom) return { text: custom, ugc: true };
  if (round >= total) return { text: labelFor("stage", "final", locale), ugc: false };
  return { text: tLabels("stage.round", { round }), ugc: false };
}

/** 카드 칩에 그대로 쓰는 단계 이름 — application-stage.ts 의 stageLabel() 의 언어별 판. */
function stageLabelOf(
  app: Row,
  project: ProjectRoundConfig | null | undefined,
  locale: Locale,
  t: T,
  tLabels: TLabels,
): StageText {
  const stage = getApplicationStage(app);
  const total = normalizeRounds(project?.selection_rounds);
  const passed = getPassedRound(app);

  switch (stage) {
    case "pending":
      return { text: labelFor("stage", "pending", locale), ugc: false };
    case "final":
      return roundLabelOf(total, project, locale, tLabels);
    case "in_progress":
      // 마지막 단계까지 올라왔는데 확정 도장이 안 찍힌 경우(레거시 데이터 포함).
      if (passed >= total) {
        return { text: t("stage.accepted_pending_confirm"), ugc: false };
      }
      return roundLabelOf(passed, project, locale, tLabels);
    case "rejected":
      return { text: labelFor("stage", "rejected", locale), ugc: false };
    case "declined":
      return { text: labelFor("stage", "declined", locale), ugc: false };
    case "withdrawn":
      return { text: labelFor("stage", "withdrawn", locale), ugc: false };
  }
}

/** "아직 최종 합격이 아니다" 문장 — application-stage.ts 의 notFinalCaveat() 의 언어별 판. */
function notFinalCaveatOf(
  app: Row,
  project: ProjectRoundConfig | null | undefined,
  locale: Locale,
  t: T,
  tLabels: TLabels,
): ReactNode {
  const total = normalizeRounds(project?.selection_rounds);
  const passed = getPassedRound(app);
  const next = roundLabelOf(Math.min(passed + 1, total), project, locale, tLabels);
  const sentence = t("stage.not_final_caveat", { stage: next.text });
  return next.ugc ? wrapPart(sentence, next.text, ugcSpan) : sentence;
}

export default async function ApplicationsPage() {
  const user = await requireUser();
  const campaignParticipants = await ownParticipants(user.id);
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await serverT(applications);
  const tLabels = translator(labels, locale);

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, responded_at, confirmed_at, passed_round,
       project:projects ( id, short_code, title, pay_amount, pay_type, application_deadline, status, selection_rounds, round_labels )`,
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Row[];

  // 영상 제출을 받는 공고는 업로드 링크를 여기서도 보여준다.
  // 지금까지 링크가 있는 곳은 안내 메일과 접수 직후 화면뿐이라,
  // 메일을 못 찾으면 제출할 방법이 없었다("제출 버튼이 어디냐"는 문의 다수).
  const submitTokenByApp = new Map<
    string,
    { token: string; uploaded: boolean }
  >();
  if (list.length) {
    const { data: subs } = await supabase
      .from("project_submissions")
      .select("application_id, token, uploaded_at")
      .in(
        "application_id",
        list.map((r) => r.id),
      );
    for (const sub of (subs ?? []) as Array<{
      application_id: string;
      token: string;
      uploaded_at: string | null;
    }>) {
      submitTokenByApp.set(sub.application_id, {
        token: sub.token,
        uploaded: sub.uploaded_at != null,
      });
    }
  }

  const grouped = new Map<ApplicationStage, Row[]>();
  for (const r of list) {
    const stage = getApplicationStage(r);
    const bucket = grouped.get(stage) ?? [];
    bucket.push(r);
    grouped.set(stage, bucket);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          {t("list.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {t("list.title")}
        </h1>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            {tCount(t, "list.total", locale, list.length)}
          </p>
          <MessagesTextLink className="text-sm font-semibold text-ink-2" />
        </div>
      </header>

      {campaignParticipants.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">{t("list.campaign.title")}</h2>
          <ul className="mt-3 space-y-2">
            {campaignParticipants.map((p) => {
              const title =
                list.find((r) => r.project?.id === p.project_id)?.project?.title ?? null;
              const line = t("list.campaign.item", {
                title: title ?? t("list.campaign.untitled"),
              });
              return (
                <li key={p.id}>
                  <Link
                    className="block rounded-lg bg-secondary px-4 py-3 text-sm font-semibold"
                    href={`/campaigns/${p.project_id}/submit`}
                  >
                    {title ? wrapPart(line, title, ugcSpan) : line}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">{t("list.empty")}</p>
          <Link
            href="/feed"
            className="mt-3 inline-block text-xs uppercase tracking-[0.14em] text-primary"
          >
            {t("list.browse_feed")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUP_ORDER.map((stage) => {
            const items = grouped.get(stage) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={stage} className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
                  {t("group.heading", {
                    label: t(GROUP_LABEL_KEYS[stage]),
                    count: items.length,
                  })}
                </p>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => {
                    const style = STAGE_STYLES[stage];
                    const chip = stageLabelOf(r, r.project, locale, t, tLabels);
                    return (
                      <li
                        key={r.id}
                        className={`flex flex-col gap-2 rounded-xl border p-3 ${style.card}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={
                              r.project
                                ? `/projects/${r.project.short_code ?? r.project.id}`
                                : "/feed"
                            }
                            className="flex-1"
                          >
                            <p
                              className="font-medium leading-snug text-foreground"
                              data-ugc={r.project?.title ? "" : undefined}
                            >
                              {r.project?.title ?? t("list.project_deleted")}
                            </p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${style.chip}`}
                                data-ugc={chip.ugc ? "" : undefined}
                              >
                                {chip.text}
                              </span>
                              <span>
                                {r.source === "direct_proposal"
                                  ? t("list.source.direct_proposal")
                                  : t("list.source.apply")}
                              </span>
                            </p>
                          </Link>
                          {r.project ? (
                            <OpenThreadButton
                              projectId={r.project.id}
                              label={t("list.message")}
                            />
                          ) : null}
                          {stage === "pending" ? (
                            <WithdrawButton applicationId={r.id} />
                          ) : null}
                          {stage === "in_progress" ? (
                            <DeclineOfferButton
                              applicationId={r.id}
                              requireReason={(r.passed_round ?? 0) >= 2}
                            />
                          ) : null}
                        </div>

                        {/* 중간 단계 합격을 최종 합격으로 오해하지 않도록 카드 안에서 한 번 더 못박는다. */}
                        {needsNotFinalCaveat(r, r.project) ? (
                          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                            {notFinalCaveatOf(r, r.project, locale, t, tLabels)}
                            <br />
                            {wrapPart(
                              t("stage.decline_hint"),
                              t("stage.decline_hint_emphasis"),
                              (s) => (
                                <b>{s}</b>
                              ),
                            )}
                          </p>
                        ) : null}

                        {stage === "final" ? (
                          <p className="rounded-md bg-ok/10 px-2 py-1.5 text-xs leading-relaxed text-ok">
                            {t("stage.final.confirmed")}
                            <br />
                            {wrapPart(t("stage.final.locked"), CONTACT_EMAIL, (s) => (
                              <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="underline underline-offset-2"
                              >
                                {s}
                              </a>
                            ))}
                          </p>
                        ) : null}

                        {(() => {
                          const sub = submitTokenByApp.get(r.id);
                          if (!sub) return null;
                          return (
                            <a
                              href={`/submit/${sub.token}`}
                              className={
                                "block rounded-lg px-3 py-2.5 text-center text-sm font-bold " +
                                (sub.uploaded
                                  ? "border border-border text-ink-2"
                                  : "bg-foreground text-background")
                              }
                            >
                              {sub.uploaded
                                ? t("list.submit.done")
                                : t("list.submit.open")}
                            </a>
                          );
                        })()}

                        {r.cover_message ? (
                          <p
                            className="rounded-md bg-secondary/40 px-2 py-1.5 text-xs text-ink-2"
                            data-ugc=""
                          >
                            {r.cover_message}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

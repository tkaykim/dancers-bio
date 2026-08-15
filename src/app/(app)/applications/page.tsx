import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DeclineOfferButton, WithdrawButton } from "@/components/project/ApplyForm";
import {
  getApplicationStage,
  needsNotFinalCaveat,
  notFinalCaveat,
  stageLabel,
  type ApplicationStage,
} from "@/lib/application-stage";

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

const GROUP_LABELS: Record<ApplicationStage, string> = {
  final: "최종 합격",
  in_progress: "선발 진행 중",
  pending: "검토 중",
  rejected: "불합격",
  declined: "포기함",
  withdrawn: "취소·만료",
};

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, responded_at, confirmed_at, passed_round,
       project:projects ( id, short_code, title, pay_amount, pay_type, application_deadline, status, selection_rounds, round_labels )`,
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Row[];

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
          ↳ 지원 / 제안
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          내 지원
        </h1>
        <p className="text-sm text-ink-2">총 {list.length}건</p>
      </header>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">아직 지원한 프로젝트가 없습니다.</p>
          <Link
            href="/feed"
            className="mt-3 inline-block text-xs uppercase tracking-[0.14em] text-primary"
          >
            ↳ 피드 보기
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
                  {GROUP_LABELS[stage]} ({items.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => {
                    const style = STAGE_STYLES[stage];
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
                            <p className="font-medium leading-snug text-foreground">
                              {r.project?.title ?? "(삭제된 프로젝트)"}
                            </p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${style.chip}`}
                              >
                                {stageLabel(r, r.project)}
                              </span>
                              <span>
                                {r.source === "direct_proposal"
                                  ? "받은 제안"
                                  : "지원"}
                              </span>
                            </p>
                          </Link>
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
                            {notFinalCaveat(r, r.project)}
                            <br />
                            참여가 어려우시면 지금 <b>참여 포기</b>를 눌러 알려주세요.
                          </p>
                        ) : null}

                        {stage === "final" ? (
                          <p className="rounded-md bg-ok/10 px-2 py-1.5 text-xs leading-relaxed text-ok">
                            최종 합격이 확정되었습니다.
                            <br />이 단계부터는 직접 포기가 불가능합니다.
                            부득이한 사정은{" "}
                            <a
                              href="mailto:contact@deetz.kr"
                              className="underline underline-offset-2"
                            >
                              contact@deetz.kr
                            </a>
                            로 연락해 주세요.
                          </p>
                        ) : null}

                        {r.cover_message ? (
                          <p className="rounded-md bg-secondary/40 px-2 py-1.5 text-xs text-ink-2">
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

import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { WithdrawButton } from "@/components/project/ApplyForm";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";

type Row = {
  id: string;
  status: keyof typeof APPLICATION_STATUS_LABELS;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  responded_at: string | null;
  project: {
    id: string;
    title: string;
    pay_amount: number | null;
    pay_type: string | null;
    application_deadline: string | null;
    status: string;
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "border-border bg-card text-ink-2",
  accepted: "border-ok/30 bg-ok/10 text-ok",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  withdrawn: "border-border bg-secondary text-ink-3",
  declined: "border-destructive/30 bg-destructive/10 text-destructive",
  expired: "border-border bg-secondary text-ink-3",
};

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, responded_at,
       project:projects ( id, title, pay_amount, pay_type, application_deadline, status )`,
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Row[];

  const grouped: Record<string, Row[]> = { pending: [], accepted: [], rejected: [], withdrawn: [] };
  for (const r of list) {
    const key =
      r.status === "pending"
        ? "pending"
        : r.status === "accepted"
          ? "accepted"
          : r.status === "rejected" || r.status === "declined"
            ? "rejected"
            : "withdrawn";
    grouped[key].push(r);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
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
          {(["pending", "accepted", "rejected", "withdrawn"] as const).map(
            (group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              const groupLabel =
                group === "pending"
                  ? "대기 중"
                  : group === "accepted"
                    ? "수락됨"
                    : group === "rejected"
                      ? "거절됨"
                      : "취소/만료";
              return (
                <section key={group} className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
                    {groupLabel} ({items.length})
                  </p>
                  <ul className="flex flex-col gap-2">
                    {items.map((r) => {
                      const colorCls =
                        STATUS_COLORS[r.status] ??
                        "border-border bg-card text-ink-2";
                      return (
                        <li
                          key={r.id}
                          className={`flex flex-col gap-2 rounded-xl border p-3 ${colorCls.split(" ")[0]} ${colorCls.split(" ")[1]}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              href={r.project ? `/projects/${r.project.id}` : "/feed"}
                              className="flex-1"
                            >
                              <p className="font-medium leading-snug text-foreground">
                                {r.project?.title ?? "(삭제된 프로젝트)"}
                              </p>
                              <p className="mt-1 text-[11px] text-ink-3">
                                {r.source === "direct_proposal" ? "받은 제안" : "지원"} · {APPLICATION_STATUS_LABELS[r.status]}
                              </p>
                            </Link>
                            {r.status === "pending" ? (
                              <WithdrawButton applicationId={r.id} />
                            ) : null}
                          </div>
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
            },
          )}
        </div>
      )}
    </div>
  );
}

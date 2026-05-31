import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { CreateOutreachForm, OutreachRowControls } from "./OutreachPanel";

type DancerOption = {
  id: string;
  stage_name: string;
  slug: string | null;
};

type OutreachRow = {
  id: string;
  dancer_id: string;
  channel: string;
  target: string | null;
  status: string;
  message_text: string | null;
  token: string | null;
  sent_at: string | null;
  claimed_at: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "이메일",
  ig_dm: "인스타 DM",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "대기열",
  sent: "발송됨",
  claimed: "claim됨",
  bounced: "반송",
  failed: "실패",
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOutreachPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: dancerData }, { data: outreachData }] = await Promise.all([
    supabase
      .from("dancers")
      .select("id, stage_name, slug")
      .is("profile_id", null)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("dancer_outreach")
      .select(
        "id, dancer_id, channel, target, status, message_text, token, sent_at, claimed_at",
      )
      .order("sent_at", { ascending: false, nullsFirst: true })
      .limit(100),
  ]);

  const dancers = (dancerData ?? []) as DancerOption[];
  const outreach = (outreachData ?? []) as OutreachRow[];

  // resolve dancer names for the outreach list
  const dancerIds = Array.from(new Set(outreach.map((o) => o.dancer_id)));
  const nameMap = new Map<string, DancerOption>();
  for (const d of dancers) nameMap.set(d.id, d);
  const missing = dancerIds.filter((id) => !nameMap.has(id));
  if (missing.length > 0) {
    const { data: extra } = await supabase
      .from("dancers")
      .select("id, stage_name, slug")
      .in("id", missing);
    for (const d of (extra ?? []) as DancerOption[]) nameMap.set(d.id, d);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 발굴 파이프라인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          아웃리치
        </h1>
        <p className="text-sm text-ink-2">
          승인된 미claim 댄서에게 프로필 claim 초대를 보냅니다.
        </p>
      </header>

      <CreateOutreachForm dancers={dancers} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">
          아웃리치 내역 ({outreach.length})
        </h2>
        {outreach.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline-2 bg-card p-6 text-center text-sm text-ink-3">
            아직 아웃리치 내역이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outreach.map((o) => {
              const dancer = nameMap.get(o.dancer_id);
              const statusColor =
                o.status === "claimed"
                  ? "border-ok/30 bg-ok/5 text-ok"
                  : o.status === "bounced" || o.status === "failed"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : o.status === "sent"
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-hairline-2 text-ink-2";
              return (
                <li
                  key={o.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {dancer?.stage_name ?? o.dancer_id}
                      </p>
                      <p className="font-mono text-[11px] text-ink-3">
                        {CHANNEL_LABEL[o.channel] ?? o.channel}
                        {o.target ? ` · ${o.target}` : ""}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                        발송 {fmt(o.sent_at)} · claim {fmt(o.claimed_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>

                  {o.message_text ? (
                    <p className="line-clamp-3 rounded-md bg-secondary/40 px-3 py-2 text-xs text-ink-2">
                      {o.message_text}
                    </p>
                  ) : null}

                  <OutreachRowControls outreachId={o.id} status={o.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/components/project/ApplyForm";
import {
  PAY_TYPE_LABELS,
  SESSION_TYPE_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/validation/projects";

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: keyof typeof STATUS_LABELS;
  pay_amount: number | null;
  pay_type: keyof typeof PAY_TYPE_LABELS | null;
  application_deadline: string | null;
  created_at: string;
  region_text: string | null;
  genre: { label_ko: string } | null;
  region: { label_ko: string } | null;
};

type SessionRow = {
  id: string;
  session_type: keyof typeof SESSION_TYPE_LABELS;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  role_notes: string | null;
  sort_order: number;
};

type ApplicationRow = {
  id: string;
  status: string;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPay(p: { pay_amount: number | null; pay_type: string | null }): string {
  if (!p.pay_amount && p.pay_type !== "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  return `₩ ${p.pay_amount.toLocaleString("ko-KR")}${p.pay_type === "per_session" ? " · 회차당" : ""}`;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      `id, owner_id, title, description, visibility, status, pay_amount, pay_type,
       application_deadline, created_at, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) notFound();
  const p = project as unknown as ProjectRow;

  const [{ data: sessionsData }, { data: ownerProfile }, { data: myApplication }] =
    await Promise.all([
      supabase
        .from("project_sessions")
        .select("id, session_type, starts_at, ends_at, location_name, role_notes, sort_order")
        .eq("project_id", id)
        .order("sort_order")
        .order("starts_at"),
      supabase
        .from("profiles")
        .select("display_name, id")
        .eq("id", p.owner_id)
        .single(),
      supabase
        .from("applications")
        .select("id, status")
        .eq("project_id", id)
        .eq("applicant_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const sessions = (sessionsData ?? []) as SessionRow[];
  const isOwner = p.owner_id === user.id;
  const myApp = myApplication as ApplicationRow | null;

  const dDay = daysUntil(p.application_deadline);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/feed"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 캐스팅 피드
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {VISIBILITY_LABELS[p.visibility]}
          </span>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
            {STATUS_LABELS[p.status]}
          </span>
          {p.genre?.label_ko ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              {p.genre.label_ko}
            </span>
          ) : null}
          {p.region_text || p.region?.label_ko ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-2">
              {p.region_text ?? p.region?.label_ko}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {p.title}
        </h1>
        {ownerProfile ? (
          <p className="text-sm text-ink-2">{ownerProfile.display_name}</p>
        ) : null}
      </header>

      <section className="grid grid-cols-2 rounded-xl border border-border bg-card divide-x divide-border">
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">페이</p>
          <p className="font-mono text-base font-semibold">{fmtPay(p)}</p>
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">마감</p>
          <p className="font-mono text-base font-semibold">
            {dDay !== null ? (dDay === 0 ? "오늘" : `D-${dDay}`) : "—"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 상세 설명
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
          {p.description}
        </p>
      </section>

      {sessions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 일정 ({sessions.length})
          </p>
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                    {SESSION_TYPE_LABELS[s.session_type]}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {fmtDateTime(s.starts_at)}
                  </span>
                </div>
                {s.location_name ? (
                  <p className="text-sm">{s.location_name}</p>
                ) : null}
                {s.role_notes ? (
                  <p className="text-xs text-ink-3">{s.role_notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Action area */}
      {isOwner ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 운영
          </p>
          <Link href={`/projects/${id}/applicants`}>
            <Button className="w-full" size="lg">
              지원자 보기 →
            </Button>
          </Link>
        </section>
      ) : myApp ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 내 지원 상태
          </p>
          <p className="font-mono text-sm">
            {myApp.status === "pending"
              ? "대기 중"
              : myApp.status === "accepted"
                ? "수락됨"
                : myApp.status === "rejected"
                  ? "거절됨"
                  : myApp.status === "withdrawn"
                    ? "취소됨"
                    : myApp.status}
          </p>
          <Link
            href="/applications"
            className="text-xs text-ink-3 underline-offset-4 hover:underline"
          >
            지원 목록에서 보기 →
          </Link>
        </section>
      ) : p.status === "open" ? (
        <ApplyForm projectId={id} />
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
          현재 모집이 닫혀 있습니다.
        </p>
      )}
    </div>
  );
}

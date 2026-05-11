import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AdminTeamActions } from "@/components/admin/AdminTeamActions";

type Status = "pending" | "approved" | "rejected";

type TeamRow = {
  id: string;
  team_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  approval_status: Status;
  approval_reject_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  is_active: boolean;
  lead_profile_id: string;
  created_at: string;
};

type ProfileLite = { id: string; display_name: string };

export default async function AdminTeamsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("teams")
    .select(
      "id, team_name, korean_name, slug, profile_img, location, approval_status, approval_reject_reason, approved_at, approved_by, is_active, lead_profile_id, created_at",
    )
    .order("approval_status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (rows ?? []) as TeamRow[];
  const profileIds = Array.from(new Set(list.map((r) => r.lead_profile_id)));
  const profileMap = new Map<string, ProfileLite>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) profileMap.set(p.id, p);
  }

  const pending = list.filter((r) => r.approval_status === "pending");
  const approved = list.filter((r) => r.approval_status === "approved");
  const rejected = list.filter((r) => r.approval_status === "rejected");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 팀 승인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">Teams</h1>
        <p className="text-sm text-ink-2">
          신규 등록된 팀을 검토하고 디렉토리 노출 여부를 결정합니다.
        </p>
      </header>

      <Section title={`대기 중 (${pending.length})`} empty="대기 중인 팀이 없습니다.">
        {pending.map((r) => (
          <TeamCard key={r.id} row={r} lead={profileMap.get(r.lead_profile_id)} />
        ))}
      </Section>

      <Section title={`승인됨 (${approved.length})`} empty="승인된 팀이 없습니다.">
        {approved.map((r) => (
          <TeamCard key={r.id} row={r} lead={profileMap.get(r.lead_profile_id)} />
        ))}
      </Section>

      {rejected.length > 0 ? (
        <Section title={`거부됨 (${rejected.length})`} empty="">
          {rejected.map((r) => (
            <TeamCard key={r.id} row={r} lead={profileMap.get(r.lead_profile_id)} />
          ))}
        </Section>
      ) : null}

      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← admin 홈
      </Link>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.length === 0 || (items.length === 1 && !items[0]);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-3">{title}</p>
      {isEmpty ? (
        empty ? (
          <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
            {empty}
          </p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
    </section>
  );
}

function TeamCard({ row, lead }: { row: TeamRow; lead?: ProfileLite }) {
  const statusColor = {
    pending: "border-warn/30 bg-warn/5 text-warn",
    approved: "border-ok/30 bg-ok/5 text-ok",
    rejected: "border-destructive/30 bg-destructive/5 text-destructive",
  }[row.approval_status];
  const publicHref = `/t/${row.slug ?? row.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {row.profile_img ? (
            <Image
              src={row.profile_img}
              alt={row.team_name}
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {row.team_name}
                {row.korean_name ? (
                  <span className="ml-1 text-xs text-ink-3">{row.korean_name}</span>
                ) : null}
                {!row.is_active ? (
                  <span className="ml-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                    해체
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-ink-3">
                팀장: {lead?.display_name ?? "(unknown)"}
                {row.location ? ` · ${row.location}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-ink-3">
                {new Date(row.created_at).toLocaleString("ko-KR")}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}
            >
              {row.approval_status}
            </span>
          </div>
        </div>
      </div>

      {row.approval_reject_reason ? (
        <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-ink-2">
          거부 사유: {row.approval_reject_reason}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={publicHref}
          className="text-[11px] uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:text-foreground hover:underline"
          target="_blank"
        >
          공개 페이지 →
        </Link>
      </div>

      <AdminTeamActions id={row.id} status={row.approval_status} />
    </li>
  );
}

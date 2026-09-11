import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AdminTeamActions } from "@/components/admin/AdminTeamActions";
import {
  Pagination,
  SearchForm,
  StatusBadge,
  StatusTabs,
  formatDate,
  parsePage,
  parseStatus,
  type StatusFilter,
  type StatusKey,
} from "@/components/admin/ApprovalListControls";

type TeamRow = {
  id: string;
  team_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  approval_status: StatusKey;
  approval_reject_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  is_active: boolean;
  lead_profile_id: string;
  created_at: string;
};

type ProfileLite = { id: string; display_name: string };

const BASE = "/admin/teams";
const PAGE_SIZE = 50;
const COLS =
  "id, team_name, korean_name, slug, profile_img, location, approval_status, approval_reject_reason, approved_at, approved_by, is_active, lead_profile_id, created_at";

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[%,()*]/g, "").trim();
  const status = parseStatus(sp.status, "pending");
  const page = parsePage(sp.page);

  const supabase = await createClient();
  // 댄서 승인과 같은 구조(상태 탭 + 검색 + 50건 페이지). 과거 `.limit(200)` 단일 조회는
  // approved 가 앞을 채우면 대기 큐가 잘리는 구조였다.
  const filtered = (
    s: StatusFilter,
    cols: string,
    opts?: { count: "exact"; head?: boolean },
  ) => {
    let qb = supabase.from("teams").select(cols, opts);
    if (s !== "all") qb = qb.eq("approval_status", s);
    if (q) qb = qb.or(`team_name.ilike.%${q}%,korean_name.ilike.%${q}%,slug.ilike.%${q}%`);
    return qb;
  };

  const [cPending, cApproved, cRejected] = await Promise.all(
    (["pending", "approved", "rejected"] as const).map((s) =>
      filtered(s, "id", { count: "exact", head: true }),
    ),
  );
  const counts: Record<StatusFilter, number> = {
    pending: cPending.count ?? 0,
    approved: cApproved.count ?? 0,
    rejected: cRejected.count ?? 0,
    all: (cPending.count ?? 0) + (cApproved.count ?? 0) + (cRejected.count ?? 0),
  };

  let listQ = filtered(status, COLS, { count: "exact" });
  if (status === "all") listQ = listQ.order("approval_status", { ascending: true });
  listQ = listQ.order("created_at", { ascending: false });
  const from = (page - 1) * PAGE_SIZE;
  const { data: rows, count: total } = await listQ.range(from, from + PAGE_SIZE - 1);
  const list = (rows ?? []) as unknown as TeamRow[];
  const totalCount = total ?? list.length;

  const profileIds = Array.from(new Set(list.map((r) => r.lead_profile_id)));
  const profileMap = new Map<string, ProfileLite>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const p of (profiles ?? []) as ProfileLite[]) profileMap.set(p.id, p);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 팀 승인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">Teams</h1>
        <p className="text-sm text-ink-2">
          신규 등록된 팀을 검토하고 디렉토리 노출 여부를 결정합니다.
        </p>
      </header>

      <StatusTabs base={BASE} current={status} counts={counts} q={q} />
      <SearchForm base={BASE} q={q} status={status} placeholder="팀명 / 한글 이름 / slug 검색" />

      <Pagination
        base={BASE}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalCount}
        status={status}
        q={q}
      />

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
          {q ? "일치하는 팀이 없습니다." : "해당 상태의 팀이 없습니다."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/40 text-[11px] uppercase tracking-[0.12em] text-ink-3">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">팀</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">팀장 · 지역</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">등록</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">상태</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => (
                <TeamTr key={r.id} row={r} lead={profileMap.get(r.lead_profile_id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← admin 홈
      </Link>
    </div>
  );
}

function TeamTr({ row, lead }: { row: TeamRow; lead?: ProfileLite }) {
  const publicHref = `/t/${row.slug ?? row.id}`;
  const sub = "text-[11px] text-ink-3";
  return (
    <tr className="align-top">
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
            {row.profile_img ? (
              <Image
                src={row.profile_img}
                alt={row.team_name}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {row.team_name}
              {row.korean_name ? (
                <span className="ml-1 text-xs font-normal text-ink-3">{row.korean_name}</span>
              ) : null}
              {!row.is_active ? (
                <span className="ml-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-normal text-destructive">
                  해체
                </span>
              ) : null}
            </p>
            <Link
              href={publicHref}
              target="_blank"
              className="text-[11px] text-ink-3 hover:text-foreground hover:underline"
            >
              공개 페이지 →
            </Link>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="truncate text-xs">{lead?.display_name ?? "(unknown)"}</p>
        {row.location ? <p className={sub}>{row.location}</p> : null}
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap ${sub}`}>{formatDate(row.created_at)}</td>
      <td className="px-3 py-2.5">
        <StatusBadge status={row.approval_status} />
        {row.approval_reject_reason ? (
          <p className={`mt-1 max-w-[180px] ${sub}`} title={row.approval_reject_reason}>
            사유: {row.approval_reject_reason}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <AdminTeamActions id={row.id} status={row.approval_status} />
      </td>
    </tr>
  );
}

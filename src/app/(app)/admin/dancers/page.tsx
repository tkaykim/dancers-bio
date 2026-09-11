import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AdminDancerActions } from "@/components/admin/AdminDancerActions";
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

type DancerRow = {
  id: string;
  profile_id: string | null;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  is_verified: boolean | null;
  approval_status: StatusKey;
  approval_reject_reason: string | null;
  display_order: number | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

type ProfileLite = {
  id: string;
  display_name: string;
};

type PrivateInfo = {
  dancer_id: string;
  height_cm: number | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  has_visa: boolean | null;
  visa_details: string | null;
  agency_name: string | null;
};

const BASE = "/admin/dancers";
const PAGE_SIZE = 50;
const COLS =
  "id, profile_id, stage_name, korean_name, slug, profile_img, location, is_verified, approval_status, approval_reject_reason, display_order, approved_at, approved_by, created_at";

export default async function AdminDancersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const sp = await searchParams;
  // ilike/or 필터에 안전하지 않은 문자 제거
  const q = (sp.q ?? "").replace(/[%,()*]/g, "").trim();
  const status = parseStatus(sp.status, "pending");
  const page = parsePage(sp.page);

  const supabase = await createClient();

  // ⚠️ 과거 버그(2026-09-11 운영 504): 대기 974 + 승인 563 = 1,537건을 한 번에 카드로 렌더하고,
  // 그 id 1,537개를 `.in()` 으로 dancer_scores / dancer_private_info 에 GET 조회 → URL 57KB 로
  // 게이트웨이에서 거절·행(hang)되어 Vercel 함수 300초 타임아웃. 모바일에서 "탭이 아예 안 열림"의 원인.
  // → 상태 탭 + 검색 + 50건 페이지네이션으로 바꾸고, 부가 조회는 현재 페이지 id(≤50)만 보낸다.
  const filtered = (
    s: StatusFilter,
    cols: string,
    opts?: { count: "exact"; head?: boolean },
  ) => {
    let qb = supabase.from("dancers").select(cols, opts);
    if (s !== "all") qb = qb.eq("approval_status", s);
    if (q) qb = qb.or(`stage_name.ilike.%${q}%,korean_name.ilike.%${q}%,slug.ilike.%${q}%`);
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
  if (status === "approved" || status === "all") {
    listQ = listQ.order("display_order", { ascending: false, nullsFirst: false });
  }
  listQ = listQ.order("created_at", { ascending: false });
  const from = (page - 1) * PAGE_SIZE;
  const { data: rows, count: total } = await listQ.range(from, from + PAGE_SIZE - 1);
  const list = (rows ?? []) as unknown as DancerRow[];
  const totalCount = total ?? list.length;
  const pageIds = list.map((r) => r.id);

  const profileIds = Array.from(
    new Set(list.map((r) => r.profile_id).filter((v): v is string => !!v)),
  );
  const [{ data: profiles }, { data: scores }, { data: privs }] = await Promise.all([
    profileIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileLite[] }),
    // 내부 경력점수 (admin-only RLS — admin 세션만 읽힘). 배지로 표시.
    pageIds.length > 0
      ? supabase
          .from("dancer_scores")
          .select("dancer_id, score, career_count")
          .in("dancer_id", pageIds)
      : Promise.resolve({ data: [] }),
    // 비공개 민감정보 (키·생년월일·연락처·국적·비자). dancer_private_info 는 RLS로
    // is_admin() OR 본인만 읽힘 — 이 페이지는 admin 서버 가드라 관리자 세션에서만 조회된다.
    pageIds.length > 0
      ? supabase
          .from("dancer_private_info")
          .select(
            "dancer_id, height_cm, birth_date, phone, email, nationality, has_visa, visa_details, agency_name",
          )
          .in("dancer_id", pageIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, ProfileLite>();
  for (const p of (profiles ?? []) as ProfileLite[]) profileMap.set(p.id, p);
  const scoreMap = new Map<string, { score: number; career_count: number }>();
  for (const s of (scores ?? []) as { dancer_id: string; score: number; career_count: number }[]) {
    scoreMap.set(s.dancer_id, { score: Number(s.score), career_count: s.career_count });
  }
  const privMap = new Map<string, PrivateInfo>();
  for (const p of (privs ?? []) as PrivateInfo[]) privMap.set(p.dancer_id, p);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 댄서 승인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          Dancer profiles
        </h1>
        <p className="text-sm text-ink-2">
          프로필을 검색·검토하고, 사진·경력을 편집하거나 노출 순서를 조정합니다.
        </p>
      </header>

      <StatusTabs base={BASE} current={status} counts={counts} q={q} />
      <SearchForm
        base={BASE}
        q={q}
        status={status}
        placeholder="활동명 / 한글 이름 / slug 검색"
      />

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
          {q ? "일치하는 프로필이 없습니다." : "해당 상태의 프로필이 없습니다."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-secondary/40 text-[11px] uppercase tracking-[0.12em] text-ink-3">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">댄서</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">계정 · 지역</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">등록</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">점수</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">비공개 정보</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">상태</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => (
                <DancerTr
                  key={r.id}
                  row={r}
                  owner={r.profile_id ? profileMap.get(r.profile_id) : undefined}
                  score={scoreMap.get(r.id)}
                  priv={privMap.get(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.length > 10 ? (
        <Pagination
          base={BASE}
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          status={status}
          q={q}
        />
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

function DancerTr({
  row,
  owner,
  score,
  priv,
}: {
  row: DancerRow;
  owner?: ProfileLite;
  score?: { score: number; career_count: number };
  priv?: PrivateInfo;
}) {
  const publicHref = `/d/${row.slug ?? row.id}`;
  const sub = "text-[11px] text-ink-3";
  return (
    <tr className="align-top">
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
            {row.profile_img ? (
              <Image
                src={row.profile_img}
                alt={row.stage_name}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {row.stage_name}
              {row.korean_name ? (
                <span className="ml-1 text-xs font-normal text-ink-3">{row.korean_name}</span>
              ) : null}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
              <Link href={publicHref} target="_blank" className="text-ink-3 hover:text-foreground hover:underline">
                공개
              </Link>
              <Link href={`/me/portfolio/${row.id}`} className="text-ink-3 hover:text-foreground hover:underline">
                편집
              </Link>
              <Link href={`/me/portfolio/${row.id}/careers`} className="text-ink-3 hover:text-foreground hover:underline">
                경력
              </Link>
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="truncate text-xs">
          {owner?.display_name ??
            (row.profile_id ? "(unknown)" : row.is_verified ? "검증됨" : "큐레이션")}
        </p>
        {row.location ? <p className={sub}>{row.location}</p> : null}
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap ${sub}`}>{formatDate(row.created_at)}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {score ? (
          <span
            className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-ink-2"
            title={`내부 경력점수 (비노출) · 경력 ${score.career_count}건`}
          >
            ★ {score.score.toFixed(1)}
          </span>
        ) : (
          <span className={sub}>–</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {priv ? (
          <div className="flex flex-col gap-0.5 text-[11px] text-ink-2">
            <div className="flex flex-wrap gap-x-2">
              {priv.nationality ? <span>{priv.nationality}</span> : null}
              {priv.birth_date ? <span>{calcAge(priv.birth_date)}세</span> : null}
              {priv.height_cm ? <span>{priv.height_cm}cm</span> : null}
              {priv.has_visa ? (
                <span className="text-warn">비자 {priv.visa_details ?? "보유"}</span>
              ) : null}
              {priv.agency_name ? <span>소속 {priv.agency_name}</span> : null}
            </div>
            {priv.phone || priv.email ? (
              <div className="flex flex-wrap gap-x-2 font-mono">
                {priv.phone ? (
                  <a href={`tel:${priv.phone}`} className="hover:underline">
                    {priv.phone}
                  </a>
                ) : null}
                {priv.email ? (
                  <a href={`mailto:${priv.email}`} className="truncate hover:underline">
                    {priv.email}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <span className={sub}>–</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={row.approval_status} />
        {row.approval_status === "approved" && row.display_order != null ? (
          <p className={`mt-1 ${sub}`}>순서 {row.display_order}</p>
        ) : null}
        {row.approval_reject_reason ? (
          <p className={`mt-1 max-w-[180px] ${sub}`} title={row.approval_reject_reason}>
            사유: {row.approval_reject_reason}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <AdminDancerActions
          id={row.id}
          status={row.approval_status}
          displayOrder={row.display_order}
        />
      </td>
    </tr>
  );
}

function calcAge(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

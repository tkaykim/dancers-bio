import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AdminDancerActions } from "@/components/admin/AdminDancerActions";

type Status = "pending" | "approved" | "rejected";

type DancerRow = {
  id: string;
  profile_id: string | null;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  approval_status: Status;
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

export default async function AdminDancersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const { q: rawQ } = await searchParams;
  // ilike/or 필터에 안전하지 않은 문자 제거
  const q = (rawQ ?? "").replace(/[%,()*]/g, "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("dancers")
    .select(
      "id, profile_id, stage_name, korean_name, slug, profile_img, location, approval_status, approval_reject_reason, display_order, approved_at, approved_by, created_at",
    );

  if (q) {
    query = query.or(
      `stage_name.ilike.%${q}%,korean_name.ilike.%${q}%,slug.ilike.%${q}%`,
    );
  }

  const { data: rows } = await query
    .order("approval_status", { ascending: true })
    .order("display_order", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const list = (rows ?? []) as DancerRow[];
  const profileIds = Array.from(
    new Set(list.map((r) => r.profile_id).filter((v): v is string => !!v)),
  );
  const profileMap = new Map<string, ProfileLite>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) profileMap.set(p.id, p);
  }

  // 내부 경력점수 (admin-only RLS — admin 세션만 읽힘). 배지로 표시.
  const scoreMap = new Map<string, { score: number; career_count: number }>();
  if (list.length > 0) {
    const { data: scores } = await supabase
      .from("dancer_scores")
      .select("dancer_id, score, career_count")
      .in(
        "dancer_id",
        list.map((r) => r.id),
      );
    for (const s of (scores ?? []) as {
      dancer_id: string;
      score: number;
      career_count: number;
    }[]) {
      scoreMap.set(s.dancer_id, { score: Number(s.score), career_count: s.career_count });
    }
  }

  const pending = list.filter((r) => r.approval_status === "pending");
  const approved = list.filter((r) => r.approval_status === "approved");
  const rejected = list.filter((r) => r.approval_status === "rejected");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 댄서 관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          Dancer profiles
        </h1>
        <p className="text-sm text-ink-2">
          프로필을 검색·검토하고, 사진·경력을 편집하거나 노출 순서를 조정합니다.
        </p>
      </header>

      <form method="get" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="활동명 / 한글 이름 / slug 검색"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          검색
        </button>
        {q ? (
          <Link
            href="/admin/dancers"
            className="h-10 shrink-0 rounded-md border border-hairline-2 px-3 text-sm leading-10 text-ink-2 hover:text-foreground"
          >
            초기화
          </Link>
        ) : null}
      </form>

      {q ? (
        <Section
          title={`검색 결과 (${list.length})`}
          empty="일치하는 프로필이 없습니다."
        >
          {list.map((r) => (
            <DancerCard
              key={r.id}
              row={r}
              owner={r.profile_id ? profileMap.get(r.profile_id) : undefined}
              score={scoreMap.get(r.id)}
            />
          ))}
        </Section>
      ) : (
        <>
          <Section
            title={`대기 중 (${pending.length})`}
            empty="대기 중인 프로필이 없습니다."
          >
            {pending.map((r) => (
              <DancerCard
                key={r.id}
                row={r}
                owner={r.profile_id ? profileMap.get(r.profile_id) : undefined}
              />
            ))}
          </Section>

          <Section
            title={`승인됨 (${approved.length})`}
            empty="승인된 프로필이 없습니다."
          >
            {approved.map((r) => (
              <DancerCard
                key={r.id}
                row={r}
                owner={r.profile_id ? profileMap.get(r.profile_id) : undefined}
              />
            ))}
          </Section>

          {rejected.length > 0 ? (
            <Section title={`거부됨 (${rejected.length})`} empty="">
              {rejected.map((r) => (
                <DancerCard
                  key={r.id}
                  row={r}
                  owner={r.profile_id ? profileMap.get(r.profile_id) : undefined}
                />
              ))}
            </Section>
          ) : null}
        </>
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

function DancerCard({
  row,
  owner,
  score,
}: {
  row: DancerRow;
  owner?: ProfileLite;
  score?: { score: number; career_count: number };
}) {
  const statusColor = {
    pending: "border-warn/30 bg-warn/5 text-warn",
    approved: "border-ok/30 bg-ok/5 text-ok",
    rejected: "border-destructive/30 bg-destructive/5 text-destructive",
  }[row.approval_status];
  const publicHref = `/d/${row.slug ?? row.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {row.profile_img ? (
            <Image
              src={row.profile_img}
              alt={row.stage_name}
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
                {row.stage_name}
                {row.korean_name ? (
                  <span className="ml-1 text-xs text-ink-3">
                    {row.korean_name}
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-ink-3">
                {owner?.display_name ?? (row.profile_id ? "(unknown)" : "큐레이션")}
                {row.location ? ` · ${row.location}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-ink-3">
                {new Date(row.created_at).toLocaleString("ko-KR")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}
              >
                {row.approval_status}
              </span>
              {score ? (
                <span
                  className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-ink-2"
                  title={`내부 경력점수 (비노출) · 경력 ${score.career_count}건`}
                >
                  ★ {score.score.toFixed(1)}
                </span>
              ) : null}
            </div>
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
        {row.approval_status === "approved" && row.display_order != null ? (
          <span className="text-[11px] text-ink-3">
            현재 노출 순서: <strong>{row.display_order}</strong>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/me/portfolio/${row.id}`}
          className="rounded-lg border border-hairline-2 px-3 py-2 text-center text-xs font-medium text-ink-2 hover:bg-secondary hover:text-foreground"
        >
          프로필·사진 편집
        </Link>
        <Link
          href={`/me/portfolio/${row.id}/careers`}
          className="rounded-lg border border-hairline-2 px-3 py-2 text-center text-xs font-medium text-ink-2 hover:bg-secondary hover:text-foreground"
        >
          경력 관리
        </Link>
      </div>

      <AdminDancerActions
        id={row.id}
        status={row.approval_status}
        displayOrder={row.display_order}
      />
    </li>
  );
}

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Crown, Plus, Shield } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

type DancerRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  approval_status: string;
};

export default async function MyPortfolioListPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Owned dancers (profile_id == me)
  const ownedPromise = supabase
    .from("dancers")
    .select("id, stage_name, korean_name, slug, profile_img, approval_status")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  // Managed dancers via dancer_managers join
  const managedPromise = supabase
    .from("dancer_managers")
    .select(
      "dancer_id, dancer:dancers!inner(id, stage_name, korean_name, slug, profile_img, approval_status, profile_id)",
    )
    .eq("manager_id", user.id);

  const [{ data: ownedRows }, { data: managedRows }] = await Promise.all([
    ownedPromise,
    managedPromise,
  ]);

  const owned = (ownedRows ?? []) as DancerRow[];
  const managed = (((managedRows ?? []) as unknown) as Array<{
    dancer: DancerRow & { profile_id: string | null };
  }>)
    .map((r) => r.dancer)
    .filter((d) => d && d.profile_id !== user.id); // de-dupe

  const total = owned.length + managed.length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 댄서 포트폴리오
          </p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            관리중인 댄서프로필
          </h1>
          <p className="text-sm text-ink-2">
            내 프로필과 매니저 권한이 부여된 프로필을 관리합니다.
          </p>
        </div>
        <Link
          href="/me/portfolio/add"
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-hairline-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-foreground hover:bg-secondary"
        >
          <Plus size={12} />
          프로필 추가
        </Link>
      </header>

      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {owned.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              <Crown size={12} />내 프로필 {owned.length}
            </span>
          ) : null}
          {managed.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-2 bg-card px-3 py-1 text-[11px] font-semibold text-ink-2">
              <Shield size={12} />매니저 {managed.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {total === 0 ? (
        <Link
          href="/me/portfolio/add"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-2 p-8 text-center transition-colors hover:bg-secondary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">댄서 프로필 만들기</p>
            <p className="text-xs text-ink-3">
              30초만에 포트폴리오를 시작할 수 있어요
            </p>
          </div>
        </Link>
      ) : (
        <ul className="flex flex-col gap-3">
          {owned.map((d) => (
            <li key={d.id}>
              <DancerCard dancer={d} role="owner" />
            </li>
          ))}
          {managed.map((d) => (
            <li key={d.id}>
              <DancerCard dancer={d} role="manager" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DancerCard({
  dancer,
  role,
}: {
  dancer: DancerRow;
  role: "owner" | "manager";
}) {
  const approvalLabel =
    dancer.approval_status === "approved"
      ? null
      : dancer.approval_status === "rejected"
        ? "거절됨"
        : "승인 대기";

  return (
    <Link
      href={`/me/portfolio/${dancer.id}`}
      className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
    >
      {dancer.profile_img ? (
        <Image
          src={dancer.profile_img}
          alt={dancer.stage_name}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold">
          {dancer.stage_name?.[0] ?? "?"}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {role === "owner" ? (
            <Crown size={12} className="text-primary" aria-hidden />
          ) : (
            <Shield size={12} className="text-ink-2" aria-hidden />
          )}
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
            {role === "owner" ? "내 프로필" : "매니저"}
          </span>
          {approvalLabel ? (
            <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
              {approvalLabel}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold leading-snug">
          {dancer.stage_name}
        </p>
        {dancer.korean_name ? (
          <p className="truncate text-[11px] text-ink-3">
            {dancer.korean_name}
          </p>
        ) : null}
      </div>
      <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}

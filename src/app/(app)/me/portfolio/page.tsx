import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Crown, Plus } from "lucide-react";
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

// Lite: 1계정 = 1댄서. own dancer 만 노출. multi-dancer 데이터가 있더라도 모두 표시
// (사용자가 정리할 수 있도록), manager 섹션은 제거.
export default async function MyPortfolioListPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: ownedRows } = await supabase
    .from("dancers")
    .select("id, stage_name, korean_name, slug, profile_img, approval_status")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  const owned = (ownedRows ?? []) as DancerRow[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 댄서 포트폴리오
          </p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            내 댄서 프로필
          </h1>
          <p className="text-sm text-ink-2">
            본인 댄서 프로필을 관리합니다.
          </p>
        </div>
        {owned.length === 0 ? (
          <Link
            href="/me/portfolio/add"
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-hairline-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-foreground hover:bg-secondary"
          >
            <Plus size={12} />
            만들기
          </Link>
        ) : null}
      </header>

      {owned.length === 0 ? (
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
              <DancerCard dancer={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DancerCard({ dancer }: { dancer: DancerRow }) {
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
          <Crown size={12} className="text-primary" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
            내 프로필
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

import Link from "next/link";
import { Crown } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { safeReturnTo } from "@/lib/safeRedirect";

export default async function AddDancerRolePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireUser();
  const { returnTo } = await searchParams;
  const safeReturn = returnTo ? safeReturnTo(returnTo, "") : "";
  const returnQs = safeReturn ? `&returnTo=${encodeURIComponent(safeReturn)}` : "";

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 포트폴리오
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          프로필 만들기
        </h1>
        <p className="text-sm text-ink-2">
          이미 등록된 댄서가 있는지 먼저 확인할까요?
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Link
          href={`/me/portfolio/add/search?role=self${returnQs}`}
          className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Crown size={18} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">시작하기</p>
            <p className="text-xs text-ink-3">
              30초만에 본인 댄서 프로필을 만들 수 있어요.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

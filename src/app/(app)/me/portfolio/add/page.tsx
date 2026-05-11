import Link from "next/link";
import { Crown, Shield } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";

export default async function AddDancerRolePage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 포트폴리오
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          프로필 추가
        </h1>
        <p className="text-sm text-ink-2">누구의 프로필을 만드시나요?</p>
      </header>

      <div className="flex flex-col gap-3">
        <Link
          href="/me/portfolio/add/search?role=self"
          className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Crown size={18} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">본인 (Self)</p>
            <p className="text-xs text-ink-3">
              나 자신의 댄서 프로필을 추가합니다. 내 계정과 연결됩니다.
            </p>
          </div>
        </Link>

        <Link
          href="/me/portfolio/add/search?role=manager"
          className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-ink-2">
            <Shield size={18} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">매니저 (Manager)</p>
            <p className="text-xs text-ink-3">
              다른 댄서를 대신해 프로필을 만들고 관리합니다.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

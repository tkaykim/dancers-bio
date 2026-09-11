import Link from "next/link";
import { Crown } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { safeReturnTo } from "@/lib/safeRedirect";
import { serverT } from "@/lib/i18n/server";
import me from "@/lib/i18n/messages/me";

export default async function AddDancerRolePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireUser();
  const t = await serverT(me);
  const { returnTo } = await searchParams;
  const safeReturn = returnTo ? safeReturnTo(returnTo, "") : "";
  const returnQs = safeReturn ? `&returnTo=${encodeURIComponent(safeReturn)}` : "";

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ {t("portfolio_add.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {t("portfolio_add.title")}
        </h1>
        <p className="text-sm text-ink-2">{t("portfolio_add.desc")}</p>
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
            <p className="text-sm font-semibold">{t("portfolio_add.start_title")}</p>
            <p className="text-xs text-ink-3">{t("portfolio_add.start_desc")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

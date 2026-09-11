import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { serverT } from "@/lib/i18n/server";
import me from "@/lib/i18n/messages/me";

export default async function ChangePasswordPage() {
  await requireUser();
  const t = await serverT(me);

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← {t("password.back")}
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ {t("password.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {t("password.title")}
        </h1>
        <p className="text-sm text-ink-2">{t("password.desc")}</p>
      </header>
      <ChangePasswordForm />
    </div>
  );
}

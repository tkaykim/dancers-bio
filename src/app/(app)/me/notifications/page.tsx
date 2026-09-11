import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { getOrCreatePrefs } from "@/lib/notify/notification-preferences";
import { NotificationSettingsForm } from "@/components/me/NotificationSettingsForm";
import { serverT } from "@/lib/i18n/server";
import me from "@/lib/i18n/messages/me";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const t = await serverT(me);
  const prefs = await getOrCreatePrefs(user.id);

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← {t("notifications.back")}
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ {t("notifications.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {t("notifications.title")}
        </h1>
        <p className="text-sm text-ink-2">{t("notifications.desc")}</p>
      </header>
      <NotificationSettingsForm
        initial={{
          email_project_match: prefs.email_project_match,
          email_marketing: prefs.email_marketing,
          push_project_match: prefs.push_project_match,
          email_unsubscribed_all: prefs.email_unsubscribed_all,
        }}
      />
    </div>
  );
}

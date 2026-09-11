import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TeamProfileForm } from "@/components/team/TeamProfileForm";
import { serverT } from "@/lib/i18n/server";
import me from "@/lib/i18n/messages/me";

export default async function NewTeamPage() {
  const user = await requireUser();
  const t = await serverT(me);
  const supabase = await createClient();

  // multi-dancer 안전(R3): 본인 소유 dancer가 여럿일 수 있어 limit(1).
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!dancer) {
    // 팀을 만들려면 본인 댄서 프로필이 필요. 역할 선택 페이지로 안내.
    redirect("/me/portfolio/add");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-8 px-6 py-8 pb-40">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ {t("team_new.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{t("team_new.title")}</h1>
        <p className="text-sm text-ink-2">{t("team_new.desc")}</p>
        <Link href="/me/teams" className="text-xs text-ink-3 hover:text-foreground">
          ← {t("team_new.back")}
        </Link>
      </header>

      <TeamProfileForm
        isCreate
        userId={user.id}
        defaultValues={{
          team_name: "",
          korean_name: "",
          slug: "",
          bio: "",
          location: "",
          specialties: [],
          genres: [],
          social_instagram: "",
          social_youtube: "",
          social_tiktok: "",
        }}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TeamProfileForm } from "@/components/team/TeamProfileForm";

export default async function NewTeamPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!dancer) {
    redirect("/onboarding/create");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 팀 만들기</p>
        <h1 className="text-2xl font-bold tracking-tight">새 팀 프로필</h1>
        <p className="text-sm text-ink-2">
          만들면 자동으로 팀장이 되며, 관리자 승인 후 디렉토리에 노출됩니다.
        </p>
        <Link href="/me/teams" className="text-xs text-ink-3 hover:text-foreground">
          ← 내 팀 목록
        </Link>
      </header>

      <TeamProfileForm
        isCreate
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

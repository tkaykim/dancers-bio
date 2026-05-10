import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { CreateProfileWizard } from "@/components/portfolio/onboarding/CreateProfileWizard";

export default async function OnboardingCreatePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    redirect("/me/portfolio");
  }

  return <CreateProfileWizard />;
}

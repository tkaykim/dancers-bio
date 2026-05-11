import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

// Backwards-compat: redirect /me/portfolio/careers → /me/portfolio/<ownDancerId>/careers
// New flow uses /me/portfolio/[dancerId]/careers since a user may manage multiple dancers.
export default async function LegacyCareersRedirect() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!dancer) redirect("/me/portfolio");
  redirect(`/me/portfolio/${dancer.id}/careers`);
}

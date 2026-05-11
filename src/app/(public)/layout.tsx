import { getUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  let proposalCount = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", user.id)
      .eq("source", "direct_proposal")
      .eq("status", "pending");
    proposalCount = count ?? 0;
  }

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className={`flex-1 ${user ? "pb-24" : ""}`}>{children}</main>
      {user ? <BottomTabBar proposalCount={proposalCount} /> : null}
    </div>
  );
}

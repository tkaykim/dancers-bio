import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();

  // Pending direct proposals count for this user — used as a badge on the Inbox tab
  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("applicant_id", user.id)
    .eq("source", "direct_proposal")
    .eq("status", "pending");

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>
      <BottomTabBar proposalCount={count ?? 0} />
    </div>
  );
}

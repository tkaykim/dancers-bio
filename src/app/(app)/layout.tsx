import { requireUser } from "@/lib/auth/guard";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>
      <BottomTabBar />
    </div>
  );
}

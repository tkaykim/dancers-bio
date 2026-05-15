import { getUser } from "@/lib/auth/guard";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className={`flex-1 ${user ? "pb-24" : ""}`}>{children}</main>
      {user ? <BottomTabBar /> : null}
    </div>
  );
}

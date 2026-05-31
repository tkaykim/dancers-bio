import { requireUser } from "@/lib/auth/guard";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return <AppShell>{children}</AppShell>;
}

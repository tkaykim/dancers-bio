import { requireSuperAdmin } from "@/lib/auth/guard";

export default async function FeeReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();
  return children;
}

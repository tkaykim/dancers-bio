import { PublicShell } from "@/components/layout/PublicShell";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mobile keeps the app-like bottom tabs; desktop gets a wider editorial shell.
  return <PublicShell>{children}</PublicShell>;
}

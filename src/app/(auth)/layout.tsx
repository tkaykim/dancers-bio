import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guard";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (user) redirect("/me");
  return <main className="min-h-svh">{children}</main>;
}

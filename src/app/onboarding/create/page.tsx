import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { CreateProfileWizard } from "@/components/portfolio/onboarding/CreateProfileWizard";

export default async function OnboardingCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requireUser();
  const { role } = await searchParams;

  // role 파라미터 없이 직접 진입하면 검색 게이트로 이동
  if (!role) {
    redirect("/me/portfolio/add");
  }

  const resolvedRole: "self" | "manager" =
    role === "manager" ? "manager" : "self";

  return <CreateProfileWizard userId={user.id} role={resolvedRole} />;
}

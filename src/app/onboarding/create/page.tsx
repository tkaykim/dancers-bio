import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { safeReturnTo } from "@/lib/safeRedirect";
import { CreateProfileWizard } from "@/components/portfolio/onboarding/CreateProfileWizard";

export default async function OnboardingCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; returnTo?: string }>;
}) {
  const user = await requireUser();
  const { role, returnTo } = await searchParams;

  // role 파라미터 없이 직접 진입하면 검색 게이트로 이동 (returnTo는 보존).
  if (!role) {
    const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    redirect(`/me/portfolio/add${qs}`);
  }

  const resolvedRole: "self" | "manager" =
    role === "manager" ? "manager" : "self";

  const safeReturn = returnTo ? safeReturnTo(returnTo, "") : "";

  return (
    <CreateProfileWizard
      userId={user.id}
      role={resolvedRole}
      returnTo={safeReturn || null}
    />
  );
}

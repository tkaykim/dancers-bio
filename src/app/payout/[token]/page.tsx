import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayoutToken } from "@/lib/quick-token";
import { TravelPayoutModal } from "@/components/payout/TravelPayoutModal";

export const metadata: Metadata = {
  title: "교통비 계좌 입력 · deetz",
  robots: { index: false, follow: false },
};

// 교통비 지급 계좌수집 공개 페이지 — 메일 CTA의 매직링크. /payout/<token>
export default async function TravelPayoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payoutId = verifyPayoutToken(token);
  if (!payoutId) notFound();

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("travel_payouts")
    .select(
      "id, recipient_name, status, account_holder, bank_name, account_number, contact",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (!row) notFound();

  const name = (row.recipient_name as string) ?? "참여자";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-100">
      {/* 딤드 브랜드 배경 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center pt-16 opacity-[0.5]">
        <DeetzLogo className="h-7 w-auto" priority />
        <p className="mt-2 text-xs text-zinc-400">댄서 매거진 &amp; 캐스팅 플랫폼</p>
      </div>

      {/* 모달/팝업 */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <TravelPayoutModal
          token={token}
          name={name}
          initial={{
            account_holder: (row.account_holder as string | null) ?? null,
            bank_name: (row.bank_name as string | null) ?? null,
            account_number: (row.account_number as string | null) ?? null,
            contact: (row.contact as string | null) ?? null,
            submitted: row.status === "submitted",
          }}
        />
      </div>
    </div>
  );
}

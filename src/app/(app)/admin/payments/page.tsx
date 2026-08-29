import { notFound } from "next/navigation";

import { PaymentsAdminTable } from "@/components/admin/PaymentsAdminTable";
import { canExecutePaymentOperationsDirectly } from "@/lib/admin/payment-operation-permissions";
import { loadAdminPayments } from "@/lib/admin/payments";
import { requireProfile } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "통합 결제 장부 | deetz admin" };

export default async function AdminPaymentsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const [data, canExecuteDirectly] = await Promise.all([
    loadAdminPayments(),
    canExecutePaymentOperationsDirectly(profile.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 관리자 · 재무</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">통합 결제 장부</h1>
        <p className="text-sm text-ink-2">
          비자·프로그램·트레이닝·Village·워크샵 결제를 한 곳에서 확인합니다.
          grigoent 주문은 원장, deetz 결제 상태는 운영용 미러로 표시합니다.
        </p>
      </header>

      <PaymentsAdminTable
        items={data.items}
        warnings={data.warnings}
        grigoentConfigured={data.grigoentConfigured}
        executionConfigured={data.executionConfigured}
        generatedAt={data.generatedAt}
        currentUserId={profile.id}
        canExecuteDirectly={canExecuteDirectly}
      />
    </div>
  );
}

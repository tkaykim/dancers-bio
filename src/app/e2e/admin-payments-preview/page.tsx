import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaymentsAdminTable } from "@/components/admin/PaymentsAdminTable";
import { buildPaymentPreviewFixtures, PAYMENT_PREVIEW_ADMIN_ID } from "@/lib/admin/payment-preview-fixtures";

export const metadata: Metadata = {
  title: "Admin payments preview | deetz",
  robots: { index: false, follow: false },
};

export default function AdminPaymentsE2EPreviewPage() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.PAYMENTS_ADMIN_E2E_PREVIEW !== "1") notFound();
  const data = buildPaymentPreviewFixtures();

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-4">Admin QA preview</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">통합 결제 장부</h1>
          <p className="mt-1 text-sm text-ink-3">검색·필터·리스트·상세·취소·환불 승인 화면을 운영 데이터와 PG 호출 없이 검증합니다.</p>
        </div>
        <PaymentsAdminTable
          items={data.items}
          warnings={[]}
          grigoentConfigured
          executionConfigured
          generatedAt={data.generatedAt}
          currentUserId={PAYMENT_PREVIEW_ADMIN_ID}
          preview
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { type ReactNode } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_META, type Brand } from "@/lib/brand";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import {
  MySettlements,
  type MySettlementRow,
  type PayoutAccount,
} from "@/components/settlement/MySettlements";
import type { DancerDocsState } from "@/components/settlement/DancerDocuments";
import { settlementRoleLabel, type SettlementStatus } from "@/lib/settlement";
import {
  isPayoutAccountValid,
  isPayoutInfoComplete,
  isResidentNumberValid,
  normalizeAccountNumber,
} from "@/lib/payout-validation";

function Shell({
  brand,
  projectTitle,
  children,
}: {
  brand: Brand;
  projectTitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <BrandLogo brand={brand} className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">정산 · 출금 신청</h1>
        <p className="text-sm text-ink-2">{projectTitle}</p>
      </div>
      {children}
    </div>
  );
}

// 단톡방 공유용 출금신청 링크. /w/<settlement_share_code> (프로젝트 단위)
// 신원확인 = 로그인 세션 → 본인 댄서 해석 → 자기 정산건 출금 신청.
// GRIGO 화이트라벨 호스트: 탭 제목 브랜드 정합 + 검색 비노출.
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata("GRIGO ENT 정산 · 출금");
}

export default async function WithdrawSharePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title")
    .eq("settlement_share_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();
  const projectId = project.id as string;
  const projectTitle = project.title as string;

  const loginHref = `/login?next=${encodeURIComponent(`/w/${code}`)}`;

  const brand = await getBrand();

  const user = await getUser();
  if (!user) {
    return (
      <Shell brand={brand} projectTitle={projectTitle}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {brand === "grigo"
              ? "출금 신청을 하려면 그리고엔터테인먼트 정산 시스템 로그인이 필요합니다."
              : "출금 신청을 하려면 deetz 로그인이 필요합니다."}
            <br />
            지원하신 계정으로 로그인하시면 자동으로 본인 확인됩니다.
          </p>
          <Link
            href={loginHref}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            로그인하고 출금 신청하기
          </Link>
        </div>
      </Shell>
    );
  }

  const dancerId = await resolveDancerIdForUserInProject(projectId, user.id);
  if (!dancerId) {
    return (
      <Shell brand={brand} projectTitle={projectTitle}>
        <div className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-5 text-center">
          <p className="text-sm font-semibold">
            이 프로젝트에 지원/참여한 기록이 없어요.
          </p>
          <p className="text-xs text-ink-2">
            다른 계정으로 지원하셨다면 그 계정으로 다시 로그인해 주세요.
          </p>
          <Link href={loginHref} className="text-xs font-semibold text-primary underline">
            다른 계정으로 로그인
          </Link>
        </div>
      </Shell>
    );
  }

  const { data: d } = await admin
    .from("dancers")
    .select("stage_name")
    .eq("id", dancerId)
    .maybeSingle();
  const dancerName = (d?.stage_name as string | null) ?? "내 프로필";

  // 겸직(출연료+교통비 등)이면 행이 여러 개다 — 전부 보여준다.
  const { data: sList } = await admin
    .from("settlements")
    .select("id, role, gross_amount, withholding_rate, status, paid_at")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  const sRows = (sList ?? []) as Array<{
    id: string;
    role: string;
    gross_amount: number | null;
    withholding_rate: number;
    status: string;
    paid_at: string | null;
  }>;

  if (sRows.length === 0) {
    return (
      <Shell brand={brand} projectTitle={projectTitle}>
        <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-ink-2">
          아직 정산 금액이 등록되지 않았어요.
          <br />
          담당자가 금액을 확정하면 여기에서 출금 신청할 수 있어요.
        </div>
      </Shell>
    );
  }

  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(
      "bank_name, bank_account_number, bank_account_holder, resident_registration_number, id_card_path, bankbook_path",
    )
    .eq("dancer_id", dancerId)
    .maybeSingle();

  const accountNumber = normalizeAccountNumber(pi?.bank_account_number);
  const hasAccount = isPayoutAccountValid(pi);

  const settlements: MySettlementRow[] = sRows.map((s) => ({
    id: s.id,
    dancerId,
    dancerName,
    // 출연료 외 role은 제목에 구분을 붙인다 (예: "… · 교통비").
    projectTitle:
      s.role === "dancer"
        ? projectTitle
        : `${projectTitle} · ${settlementRoleLabel(s.role)}`,
    grossAmount: s.gross_amount as number,
    rate: Number(s.withholding_rate),
    status: s.status as SettlementStatus,
    paidAt: s.paid_at,
  }));
  const accounts: Record<string, PayoutAccount | null> = {
    [dancerId]:
      hasAccount
        ? {
            bankName: pi?.bank_name as string,
            accountNumber,
            accountHolder: pi?.bank_account_holder as string,
          }
        : null,
  };
  const docs: Record<string, DancerDocsState> = {
    [dancerId]: { idCard: !!pi?.id_card_path, bankbook: !!pi?.bankbook_path },
  };

  return (
    <Shell brand={brand} projectTitle={projectTitle}>
      <MySettlements
        settlements={settlements}
        accounts={accounts}
        payoutReady={{
          [dancerId]: isPayoutInfoComplete(pi),
        }}
        residentNumberRegistered={{
          [dancerId]: isResidentNumberValid(pi?.resident_registration_number),
        }}
        docs={docs}
        dancerNames={{ [dancerId]: dancerName }}
        brandName={BRAND_META[brand].orgName}
      />
    </Shell>
  );
}

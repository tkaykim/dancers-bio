import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManagePool, isAdminUser } from "@/lib/settlement-pool";
import { isPayeePayoutReady } from "@/lib/payout-validation";
import {
  ProjectPoolConsole,
  type PoolRow,
} from "@/components/admin/ProjectPoolConsole";
import type { SettlementStatus } from "@/lib/settlement";
import {
  computeSettlementPayouts,
  type LedgerEntryInput,
  resolvePayoutStage,
  type SettlementPayout,
} from "@/lib/payout-state";

export const dynamic = "force-dynamic";

// 프로젝트 풀 화면 — 수주액(공급가) − 직접비 = 풀 → 스태프·소개비 분배 → 잔여=회사 유보.
// 설계 정본 docs/design-staff-settlement-pool.md §6. 권한 = owner/admin(§4.3), 공동관리자 제외.
export default async function ProjectPoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await requireUser();
  if (!(await canManagePool(projectId, user.id))) notFound();
  const amAdmin = await isAdminUser(user.id);

  const admin = createAdminClient();
  const [{ data: project }, { data: fin }, { data: sRows }] = await Promise.all(
    [
      admin
        .from("projects")
        .select("id, title")
        .eq("id", projectId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("project_finances")
        .select("client_revenue, expense_amount, staff_pool_enabled")
        .eq("project_id", projectId)
        .maybeSingle(),
      admin
        .from("settlements")
        .select(
          "id, dancer_id, role, gross_amount, withholding_rate, tax_mode, vat_amount, tax_invoice_received_at, status, memo",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ],
  );
  if (!project) notFound();

  type SRow = {
    id: string;
    dancer_id: string;
    role: string;
    gross_amount: number | null;
    withholding_rate: number;
    tax_mode: string;
    vat_amount: number;
    tax_invoice_received_at: string | null;
    status: SettlementStatus;
    memo: string | null;
  };
  const settlements = (sRows ?? []) as SRow[];
  const active = settlements.filter((s) => s.status !== "cancelled");

  // 집계 규약(§2): cancelled 제외 전액 포함, 풀 차감은 gross(공급가)만.
  const sumGross = (rows: SRow[]) =>
    rows.reduce((t, s) => t + (s.gross_amount ?? 0), 0);
  const directLabor = sumGross(
    active.filter((s) => s.role === "dancer" || s.role === "travel"),
  );
  const distributed = sumGross(
    active.filter((s) => s.role !== "dancer" && s.role !== "travel"),
  );
  // 수주액 소스 전환(expand-contract, docs/design-client-receivables.md §6.1):
  // 받을 돈 딜의 확정+(confirmed/invoiced/received) 라인이 있으면 그 공급가 합계가 수주액,
  // 없으면 legacy 수기값(client_revenue). 딜만 있고 확정 라인이 없으면 0으로 오독되지 않게 수기값 유지.
  const { data: dealRows } = await admin
    .from("project_client_deals")
    .select("id, status")
    .eq("project_id", projectId);
  const activeDealIds = (
    (dealRows ?? []) as Array<{ id: string; status: string }>
  )
    .filter((d) => d.status !== "cancelled")
    .map((d) => d.id);
  let dealRevenue: number | null = null;
  if (activeDealIds.length > 0) {
    const { data: lineRows } = await admin
      .from("deal_revenue_lines")
      .select("supply_amount, status")
      .in("deal_id", activeDealIds)
      .in("status", ["confirmed", "invoiced", "received"]);
    const billable = (lineRows ?? []) as Array<{ supply_amount: number }>;
    if (billable.length > 0)
      dealRevenue = billable.reduce((t, l) => t + l.supply_amount, 0);
  }
  const manualRevenue = (fin?.client_revenue as number | null) ?? null;
  const revenue = dealRevenue ?? manualRevenue;
  const revenueSource: "deals" | "manual" =
    dealRevenue != null ? "deals" : "manual";
  const expense = (fin?.expense_amount as number | null) ?? 0;
  const pool = revenue != null ? revenue - directLabor - expense : null;
  const residual = pool != null ? pool - distributed : null;

  // 분배(staff/referral/other) 행 상세 + 수취인 상태.
  const staffRows = settlements.filter(
    (s) => s.role !== "dancer" && s.role !== "travel",
  );
  const dancerIds = [...new Set(staffRows.map((s) => s.dancer_id))];
  const nameById = new Map<string, string>();
  const payeeById = new Map<
    string,
    { payoutReady: boolean; taxMode: string; hasAccount: boolean }
  >();
  const balanceById = new Map<string, number>();
  if (dancerIds.length > 0) {
    const [{ data: dRows }, { data: piRows }] = await Promise.all([
      admin
        .from("dancers")
        .select("id, stage_name, korean_name, profile_id")
        .in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select(
          "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number, payee_tax_mode, business_registration_number",
        )
        .in("dancer_id", dancerIds),
    ]);
    for (const d of (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
      profile_id: string | null;
    }>) {
      nameById.set(
        d.id,
        (d.korean_name?.trim() || d.stage_name?.trim()) ?? "수취인",
      );
      payeeById.set(d.id, {
        payoutReady: false,
        taxMode: "withholding",
        hasAccount: !!d.profile_id,
      });
    }
    for (const pi of (piRows ?? []) as Array<
      Parameters<typeof isPayeePayoutReady>[0] & {
        dancer_id: string;
        payee_tax_mode?: string | null;
      }
    >) {
      const cur = payeeById.get(pi.dancer_id) ?? {
        payoutReady: false,
        taxMode: "withholding",
        hasAccount: false,
      };
      payeeById.set(pi.dancer_id, {
        ...cur,
        payoutReady: isPayeePayoutReady(pi),
        taxMode: (pi.payee_tax_mode as string | null) ?? "withholding",
      });
    }
    // 수취인 전역 잔액(참고값) — 프로젝트 미귀속(§6 D2), 수취인 단위 1회 표시.
    await Promise.all(
      dancerIds.map(async (id) => {
        const { data } = await admin.rpc("dancer_balance", {
          p_dancer_id: id,
        });
        balanceById.set(id, Number(data ?? 0));
      }),
    );
  }

  // 지급 여부는 status가 아니라 원장으로 판정한다(잔액 출금 후에도 pending).
  const payoutBySettlement = new Map<string, SettlementPayout>();
  if (dancerIds.length > 0) {
    const [{ data: ledgerRows }, { data: wrRows }] = await Promise.all([
      admin
        .from("dancer_ledger_entries")
        .select("dancer_id, entry_type, ref_type, ref_id, amount, created_at")
        .in("dancer_id", dancerIds),
      admin
        .from("withdrawal_requests")
        .select("dancer_id, amount")
        .in("dancer_id", dancerIds)
        .eq("status", "requested"),
    ]);
    const ledgerByDancer = new Map<string, LedgerEntryInput[]>();
    for (const l of (ledgerRows ?? []) as Array<{
      dancer_id: string;
      entry_type: string;
      ref_type: string | null;
      ref_id: string | null;
      amount: number;
      created_at: string;
    }>) {
      const list = ledgerByDancer.get(l.dancer_id) ?? [];
      list.push({
        entryType: l.entry_type,
        refType: l.ref_type,
        refId: l.ref_id,
        amount: Number(l.amount),
        createdAt: l.created_at,
      });
      ledgerByDancer.set(l.dancer_id, list);
    }
    const requestedByDancer = new Map<string, number>();
    for (const w of (wrRows ?? []) as Array<{ dancer_id: string; amount: number }>) {
      requestedByDancer.set(
        w.dancer_id,
        (requestedByDancer.get(w.dancer_id) ?? 0) + Number(w.amount),
      );
    }
    for (const dancerId of dancerIds) {
      const payouts = computeSettlementPayouts(
        ledgerByDancer.get(dancerId) ?? [],
        requestedByDancer.get(dancerId) ?? 0,
      );
      for (const [settlementId, payout] of payouts) {
        payoutBySettlement.set(settlementId, payout);
      }
    }
  }

  const rows: PoolRow[] = staffRows.map((s) => ({
    id: s.id,
    dancerId: s.dancer_id,
    name: nameById.get(s.dancer_id) ?? "수취인",
    role: s.role,
    grossAmount: s.gross_amount,
    rate: Number(s.withholding_rate),
    taxMode: s.tax_mode,
    vatAmount: s.vat_amount,
    taxInvoiceReceived: !!s.tax_invoice_received_at,
    status: s.status,
    memo: s.memo,
    payoutReady: payeeById.get(s.dancer_id)?.payoutReady ?? false,
    payeeTaxMode: payeeById.get(s.dancer_id)?.taxMode ?? "withholding",
    hasAccount: payeeById.get(s.dancer_id)?.hasAccount ?? false,
    balance: balanceById.get(s.dancer_id) ?? 0,
    payoutStage: resolvePayoutStage(
      s.status,
      s.gross_amount,
      payoutBySettlement.get(s.id),
    ),
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-16 pt-8">
      <header className="flex flex-col gap-1">
        <Link
          href={`/projects/${projectId}/settlements`}
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← 정산 관리
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">프로젝트 풀</h1>
        <p className="text-sm text-ink-3">{project.title as string}</p>
      </header>

      <ProjectPoolConsole
        projectId={projectId}
        isAdmin={amAdmin}
        staffPoolEnabled={fin?.staff_pool_enabled === true}
        clientRevenue={revenue}
        revenueSource={revenueSource}
        manualClientRevenue={manualRevenue}
        expenseAmount={expense}
        directLabor={directLabor}
        pool={pool}
        distributed={distributed}
        residual={residual}
        rows={rows}
      />
    </div>
  );
}

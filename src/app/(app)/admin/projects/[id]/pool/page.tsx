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
  const revenue = (fin?.client_revenue as number | null) ?? null;
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

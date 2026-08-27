import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_META } from "@/lib/brand";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import {
  BalanceWithdraw,
  type PendingWithdrawal,
} from "@/components/settlement/BalanceWithdraw";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MySettlements,
  type MySettlementRow,
  type PayoutAccount,
} from "@/components/settlement/MySettlements";
import { SettlementSummary } from "@/components/settlement/SettlementSummary";
import type { DancerDocsState } from "@/components/settlement/DancerDocuments";
import {
  calcPayout,
  calcSettlement,
  isAwaitingAmount,
  settlementRoleLabel,
  type SettlementStatus,
} from "@/lib/settlement";
import {
  expectedPayoutLabel,
  kstYear,
  nextPayoutLabel,
  sumByKstYear,
} from "@/lib/payout-schedule";
import {
  isPayoutAccountValid,
  isPayoutInfoComplete,
  isResidentNumberValid,
  normalizeAccountNumber,
} from "@/lib/payout-validation";

// GRIGO 화이트라벨 호스트: 탭 제목·공유 카드도 회사 명의로.
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata("GRIGO ENT 정산 · 출금");
}

export default async function MySettlementsPage() {
  const user = await requireUser();
  const brand = await getBrand();
  const supabase = await createClient();

  // 본인 댄서 프로필 (profile_id = uid)
  const { data: dancerRows } = await supabase
    .from("dancers")
    .select("id, stage_name")
    .eq("profile_id", user.id);
  const dancers = (dancerRows ?? []) as Array<{
    id: string;
    stage_name: string | null;
  }>;
  const dancerIds = dancers.map((d) => d.id);
  const nameById = new Map(dancers.map((d) => [d.id, d.stage_name ?? "내 프로필"]));

  let settlements: MySettlementRow[] = [];
  // 실제 입금된 건(구 경로 정산 paid + 잔액 출금 paid). 연도별 '받은 정산'
  // 합계의 유일한 입력이며, 상세 페이지(/me/settlements/history)와 같은 규칙.
  const receivedRows: Array<{ paidAt: string; amount: number }> = [];
  const accounts: Record<string, PayoutAccount | null> = {};
  const payoutReady: Record<string, boolean> = {};
  const residentNumberRegistered: Record<string, boolean> = {};
  const docs: Record<string, DancerDocsState> = {};

  if (dancerIds.length > 0) {
    const { data: sRows } = await supabase
      .from("settlements")
      .select(
        "id, dancer_id, role, gross_amount, withholding_rate, tax_mode, vat_amount, status, created_at, requested_at, paid_at, project:projects!settlements_project_id_fkey ( title )",
      )
      .in("dancer_id", dancerIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    type Row = {
      id: string;
      dancer_id: string;
      role: string;
      gross_amount: number;
      withholding_rate: number;
      tax_mode: string | null;
      vat_amount: number | null;
      status: SettlementStatus;
      created_at: string | null;
      requested_at: string | null;
      paid_at: string | null;
      project: { title: string } | { title: string }[] | null;
    };
    const rawSettlements = (sRows ?? []) as unknown as Row[];

    // 받은 정산 합계는 /me/settlements/history와 같은 식(calcPayout)으로 쌓는다
    // — 요약 타일과 상세 페이지가 다른 숫자를 말하면 안 된다.
    for (const r of rawSettlements) {
      if (r.status !== "paid" || !r.paid_at) continue;
      receivedRows.push({
        paidAt: r.paid_at,
        amount: calcPayout({
          gross: r.gross_amount ?? 0,
          rate: Number(r.withholding_rate),
          taxMode: r.tax_mode,
          vatAmount: r.vat_amount,
        }).transfer,
      });
    }

    settlements = rawSettlements.map((r) => {
      const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
      const baseTitle = proj?.title ?? "(공고)";
      return {
        id: r.id,
        dancerId: r.dancer_id,
        dancerName: nameById.get(r.dancer_id) ?? "내 프로필",
        // 출연료 외 role(교통비·스태프·소개비)은 제목에 구분을 붙인다.
        projectTitle:
          r.role === "dancer"
            ? baseTitle
            : `${baseTitle} · ${settlementRoleLabel(r.role)}`,
        grossAmount: r.gross_amount,
        rate: Number(r.withholding_rate),
        status: r.status,
        createdAt: r.created_at,
        paidAt: r.paid_at,
        expectedPayoutLabel:
          r.status === "requested"
            ? expectedPayoutLabel(r.requested_at ?? r.created_at ?? new Date())
            : null,
      };
    });

    const { data: piRows } = await supabase
      .from("dancer_private_info")
      .select(
        "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number, id_card_path, bankbook_path",
      )
      .in("dancer_id", dancerIds);
    for (const id of dancerIds) {
      accounts[id] = null;
      payoutReady[id] = false;
      residentNumberRegistered[id] = false;
      docs[id] = { idCard: false, bankbook: false };
    }
    for (const pi of (piRows ?? []) as Array<{
      dancer_id: string;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_holder: string | null;
      resident_registration_number: string | null;
      id_card_path: string | null;
      bankbook_path: string | null;
    }>) {
      const accountNumber = normalizeAccountNumber(pi.bank_account_number);
      const hasAccount = isPayoutAccountValid(pi);
      accounts[pi.dancer_id] =
        hasAccount
          ? {
              bankName: pi.bank_name!,
              accountNumber,
              accountHolder: pi.bank_account_holder!,
            }
          : null;
      payoutReady[pi.dancer_id] = isPayoutInfoComplete(pi);
      residentNumberRegistered[pi.dancer_id] = isResidentNumberValid(
        pi.resident_registration_number,
      );
      docs[pi.dancer_id] = {
        idCard: !!pi.id_card_path,
        bankbook: !!pi.bankbook_path,
      };
    }
  }

  // 잔액 원장 기반 부분 출금 데이터.
  // 잔액은 이미 세후이므로 여기서 추가 공제가 없다.
  const balanceByDancer: Record<string, { balance: number; available: number }> = {};
  const pendingByDancer: Record<string, PendingWithdrawal[]> = {};
  let processingTotal = 0;
  let processingCount = 0;
  if (dancerIds.length > 0) {
    const svc = createAdminClient();
    const [{ data: ledgerRows }, { data: wrRows }] = await Promise.all([
      svc.from("dancer_ledger_entries").select("dancer_id, amount").in("dancer_id", dancerIds),
      svc
        .from("withdrawal_requests")
        .select(
          "id, dancer_id, amount, requested_at, paid_at, bank_name, bank_account_number, status",
        )
        .in("dancer_id", dancerIds)
        .in("status", ["requested", "paid"])
        .order("requested_at", { ascending: false }),
    ]);
    type WrRow = {
      id: string;
      dancer_id: string;
      amount: number;
      requested_at: string;
      paid_at: string | null;
      bank_name: string | null;
      bank_account_number: string | null;
      status: string;
    };
    const withdrawals = (wrRows ?? []) as WrRow[];
    for (const wr of withdrawals) {
      if (wr.status === "paid" && wr.paid_at) {
        receivedRows.push({ paidAt: wr.paid_at, amount: Number(wr.amount) });
      }
    }
    for (const id of dancerIds) {
      const bal = (ledgerRows ?? [])
        .filter((r) => (r as { dancer_id: string }).dancer_id === id)
        .reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
      const reqs = withdrawals.filter(
        (r) => r.dancer_id === id && r.status === "requested",
      );
      const held = reqs.reduce((sum, r) => sum + Number(r.amount), 0);
      // ⚠ 이행기: 잔액 출금으로 일원화하기 전에 이미 '출금신청'된 정산 건이
      // 관리자 큐에서 이체를 기다리고 있다. 그 금액도 예약으로 빼지 않으면
      // 같은 돈을 잔액에서 또 신청할 수 있다(구 경로 + 신 경로 = 이중 지급).
      const legacyHeld = settlements
        .filter((x) => x.dancerId === id && x.status === "requested")
        .reduce(
          (sum, x) => sum + calcSettlement(x.grossAmount ?? 0, x.rate).net,
          0,
        );
      processingTotal += held + legacyHeld;
      balanceByDancer[id] = {
        balance: bal,
        available: bal - held - legacyHeld,
      };
      pendingByDancer[id] = reqs.map((row) => {
        const no = row.bank_account_number ?? "";
        return {
          id: row.id,
          amount: Number(row.amount),
          requestedAt: row.requested_at,
          bankName: row.bank_name,
          accountTail: no ? `***${no.slice(-4)}` : null,
          expectedPayoutLabel: expectedPayoutLabel(row.requested_at),
        };
      });
      processingCount += reqs.length;
    }
  }

  // 요약 카드 데이터 (전 프로필 합산).
  // 구 경로 정산 paid와 잔액 출금 paid는 경로가 갈려 겹치지 않는다
  // (정산 paid = 원장 earn+withdraw / 잔액 출금 = withdraw만) — 이중계상 없음.
  const receivedByYear = sumByKstYear(receivedRows);
  const awaitingCount = settlements.filter((s) =>
    isAwaitingAmount(s.status, s.grossAmount),
  ).length;
  processingCount += settlements.filter((s) => s.status === "requested").length;
  const availableTotal = Object.values(balanceByDancer).reduce(
    (sum, b) => sum + Math.max(0, b.available),
    0,
  );
  const payoutLabel = nextPayoutLabel();
  const currentYear = kstYear(new Date().toISOString());

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex flex-col gap-1">
        {brand === "grigo" ? (
          <BrandLogo brand={brand} className="mb-2 h-8 w-auto" priority />
        ) : (
          <Link
            href="/me"
            className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
          >
            ← 마이
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">정산 · 출금</h1>
        <p className="text-sm text-ink-3">
          내 돈이 지금 어디에 있는지, 다음 입금이 언제인지 한눈에 볼 수 있어요.
        </p>
      </header>

      {dancerIds.length > 0 ? (
        <SettlementSummary
          awaitingCount={awaitingCount}
          availableTotal={availableTotal}
          processingTotal={processingTotal}
          processingCount={processingCount}
          nextPayoutLabel={payoutLabel}
          receivedByYear={receivedByYear}
          currentYear={currentYear}
        />
      ) : null}

      {dancerIds.map((id) => (
        <BalanceWithdraw
          key={id}
          dancerId={id}
          dancerName={nameById.get(id) ?? "내 프로필"}
          balance={balanceByDancer[id]?.balance ?? 0}
          available={balanceByDancer[id]?.available ?? 0}
          pending={pendingByDancer[id] ?? []}
          payoutReady={payoutReady[id] ?? false}
          brandName={BRAND_META[brand].orgName}
          nextPayoutLabel={payoutLabel}
        />
      ))}

      {dancerIds.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
          댄서 포트폴리오가 있어야 정산을 받을 수 있어요.{" "}
          <Link href="/me/portfolio" className="font-semibold text-primary">
            포트폴리오 만들기 →
          </Link>
        </div>
      ) : (
        <MySettlements
          settlements={settlements}
          accounts={accounts}
          payoutReady={payoutReady}
          residentNumberRegistered={residentNumberRegistered}
          docs={docs}
          dancerNames={Object.fromEntries(nameById)}
          brandName={BRAND_META[brand].orgName}
          variant="page"
        />
      )}
    </div>
  );
}

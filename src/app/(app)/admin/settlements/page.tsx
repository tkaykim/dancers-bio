import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BalanceWithdrawalQueue,
  type BalanceWithdrawalRow,
} from "@/components/admin/BalanceWithdrawalQueue";
import {
  WithdrawalRequests,
  type WithdrawalRow,
} from "@/components/admin/WithdrawalRequests";
import { calcSettlement, type SettlementStatus } from "@/lib/settlement";
import {
  computeSettlementPayouts,
  type LedgerEntryInput,
  type SettlementPayoutStage,
  resolvePayoutStage,
} from "@/lib/payout-state";

export default async function AdminSettlementsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const admin = createAdminClient();
  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, project_id, dancer_id, gross_amount, withholding_rate, status, requested_at, paid_at, project:projects!settlements_project_id_fkey ( title )",
    )
    .in("status", ["pending", "requested", "paid"])
    .order("requested_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    project_id: string;
    dancer_id: string;
    gross_amount: number;
    withholding_rate: number;
    status: SettlementStatus;
    requested_at: string | null;
    paid_at: string | null;
    project: { title: string } | { title: string }[] | null;
  };
  const rows = (sRows ?? []) as unknown as Row[];

  // 댄서 이름 + 계좌 (service-role)
  const dancerIds = [...new Set(rows.map((r) => r.dancer_id))];
  const dancerById = new Map<
    string,
    { displayName: string; koreanName: string | null; stageName: string | null }
  >();
  const acctById = new Map<
    string,
    { bank: string; number: string; holder: string } | null
  >();
  const docsById = new Map<string, { idCard: boolean; bankbook: boolean }>();
  const rrnById = new Map<string, string | null>();
  if (dancerIds.length > 0) {
    const { data: dRows } = await admin
      .from("dancers")
      .select("id, stage_name, korean_name")
      .in("id", dancerIds);
    for (const d of (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
    }>) {
      dancerById.set(d.id, {
        displayName: d.stage_name ?? d.korean_name ?? "(이름 없음)",
        koreanName: d.korean_name,
        stageName: d.stage_name,
      });
    }

    const { data: piRows } = await admin
      .from("dancer_private_info")
      .select(
        "dancer_id, bank_name, bank_account_number, bank_account_holder, id_card_path, bankbook_path, resident_registration_number",
      )
      .in("dancer_id", dancerIds);
    for (const pi of (piRows ?? []) as Array<{
      dancer_id: string;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_holder: string | null;
      id_card_path: string | null;
      bankbook_path: string | null;
      resident_registration_number: string | null;
    }>) {
      rrnById.set(pi.dancer_id, pi.resident_registration_number ?? null);
      acctById.set(
        pi.dancer_id,
        pi.bank_name && pi.bank_account_number && pi.bank_account_holder
          ? {
              bank: pi.bank_name,
              number: pi.bank_account_number,
              holder: pi.bank_account_holder,
            }
          : null,
      );
      docsById.set(pi.dancer_id, {
        idCard: !!pi.id_card_path,
        bankbook: !!pi.bankbook_path,
      });
    }
  }

  // ⭐ 지급 여부는 settlements.status로 알 수 없다.
  // 출금이 잔액 경로로 일원화된 뒤 status는 pending에 머물고, 실제 이체는
  // 원장(withdraw)과 withdrawal_requests에 남는다. 그래서 이미 이체가 끝난 건도
  // status만 보면 계속 '출금신청 전'으로 보였다(담당자 오독의 직접 원인).
  // 원장을 정산 건별로 FIFO 배분해 실제 지급 상태를 계산한다.
  const payoutBySettlement = new Map<
    string,
    ReturnType<typeof computeSettlementPayouts> extends Map<string, infer V>
      ? V
      : never
  >();
  if (dancerIds.length > 0) {
    const [{ data: ledgerRows }, { data: wrAll }] = await Promise.all([
      admin
        .from("dancer_ledger_entries")
        .select("dancer_id, entry_type, ref_type, ref_id, amount, created_at")
        .in("dancer_id", dancerIds),
      admin
        .from("withdrawal_requests")
        .select("dancer_id, amount, status")
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
    for (const w of (wrAll ?? []) as Array<{ dancer_id: string; amount: number }>) {
      requestedByDancer.set(
        w.dancer_id,
        (requestedByDancer.get(w.dancer_id) ?? 0) + Number(w.amount),
      );
    }
    for (const dancerId of dancerIds) {
      // 구 경로(settlements.status='requested')도 예약분으로 함께 넘긴다.
      const legacyNet = rows
        .filter((r) => r.dancer_id === dancerId && r.status === "requested")
        .reduce(
          (sum, r) => sum + calcSettlement(r.gross_amount, Number(r.withholding_rate)).net,
          0,
        );
      const payouts = computeSettlementPayouts(
        ledgerByDancer.get(dancerId) ?? [],
        requestedByDancer.get(dancerId) ?? 0,
        legacyNet,
      );
      for (const [settlementId, payout] of payouts) {
        payoutBySettlement.set(settlementId, payout);
      }
    }
  }

  const list: WithdrawalRow[] = rows.map((r) => {
    const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
    const acct = acctById.get(r.dancer_id) ?? null;
    const doc = docsById.get(r.dancer_id) ?? { idCard: false, bankbook: false };
    const dancer = dancerById.get(r.dancer_id);
    const payout = payoutBySettlement.get(r.id);
    return {
      payoutStage: resolvePayoutStage(
        r.status,
        r.gross_amount,
        payout,
      ) as SettlementPayoutStage,
      payoutPaidAt: payout?.paidAt ?? r.paid_at,
      id: r.id,
      projectId: r.project_id,
      dancerId: r.dancer_id,
      dancerName: dancer?.displayName ?? "(이름 없음)",
      dancerKoreanName: dancer?.koreanName ?? null,
      dancerStageName: dancer?.stageName ?? null,
      projectTitle: proj?.title ?? "(공고)",
      grossAmount: r.gross_amount,
      rate: Number(r.withholding_rate),
      status: r.status,
      requestedAt: r.requested_at,
      paidAt: r.paid_at,
      bankName: acct?.bank ?? null,
      accountNumber: acct?.number ?? null,
      accountHolder: acct?.holder ?? null,
      residentNumber: rrnById.get(r.dancer_id) ?? null,
      hasIdCard: doc.idCard,
      hasBankbook: doc.bankbook,
    };
  });

  // 잔액 기반 부분 출금 신청 큐 (기존 정산 건별 출금과 별개 경로).
  const svcAdmin = createAdminClient();
  const { data: wrRows } = await svcAdmin
    .from("withdrawal_requests")
    .select("id, dancer_id, amount, requested_at, bank_name, bank_account_number, bank_account_holder")
    .eq("status", "requested")
    .order("requested_at", { ascending: true });
  const wrDancerIds = [
    ...new Set(((wrRows ?? []) as Array<{ dancer_id: string }>).map((r) => r.dancer_id)),
  ];
  const wrNameById = new Map<string, string>();
  if (wrDancerIds.length > 0) {
    const { data: dRows } = await svcAdmin
      .from("dancers")
      .select("id, stage_name, korean_name")
      .in("id", wrDancerIds);
    for (const d of (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
    }>) {
      const stage = d.stage_name ?? "댄서";
      wrNameById.set(
        d.id,
        d.korean_name && d.korean_name !== stage ? `${stage} (${d.korean_name})` : stage,
      );
    }
  }
  const balanceRows: BalanceWithdrawalRow[] = ((wrRows ?? []) as Array<{
    id: string;
    dancer_id: string;
    amount: number;
    requested_at: string;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_holder: string | null;
  }>).map((r) => ({
    id: r.id,
    dancerName: wrNameById.get(r.dancer_id) ?? "댄서",
    amount: Number(r.amount),
    requestedAt: r.requested_at,
    bankName: r.bank_name,
    accountNumber: r.bank_account_number,
    accountHolder: r.bank_account_holder,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 관리자</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">정산 · 출금 처리</h1>
          <Link
            href="/admin/settlements/ledger"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-secondary"
          >
            지급 장부 →
          </Link>
        </div>
        <p className="text-sm text-ink-3">
          댄서가 출금 신청한 건을 처리하고, 신분증·통장사본을 직접 올리거나 대조할 수
          있어요. 실제 통장에서 이체한 뒤 &lsquo;이체 완료 처리&rsquo;를 누르면 댄서
          화면이 입금완료로 바뀝니다. (이 화면은 이체를 대신하지 않습니다.)
        </p>
        <p className="text-xs text-ink-3">
          표시 금액은 실수령(원천징수 3.3% 공제 후)이에요. 3.3%는 플랫폼 수수료가
          아니라 국세청에 납부되는 세금(소득세 3% + 지방소득세 0.3%)입니다.
        </p>
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-ink-2">
          지급 주기: 댄서 화면에는 &lsquo;출금 신청분은 매주 금요일 일괄
          입금&rsquo;으로 안내돼요. 금요일마다 잔액 출금 큐와 아래 출금신청
          큐를 함께 비워 주세요. (목요일까지 신청분 = 그 주 금요일 지급)
        </p>
      </header>
      <BalanceWithdrawalQueue rows={balanceRows} />
      <WithdrawalRequests rows={list} />
    </div>
  );
}

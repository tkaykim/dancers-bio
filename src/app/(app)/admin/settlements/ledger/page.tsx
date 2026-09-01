import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SettlementLedger,
  type LedgerRow,
  type LedgerPeriod,
} from "@/components/admin/SettlementLedger";
import { calcSettlement } from "@/lib/settlement";
import {
  computeSettlementPayouts,
  type LedgerEntryInput,
  type SettlementPayout,
} from "@/lib/payout-state";

// 기간 → paid_at 필터 경계 (KST 기준). 반환은 timestamptz ISO(+09:00).
function kstRange(
  period: LedgerPeriod,
  fromParam?: string,
  toParam?: string,
): { from: string | null; to: string | null } {
  if (period === "all") return { from: null, to: null };
  if (period === "custom") {
    return {
      from: fromParam ? `${fromParam}T00:00:00+09:00` : null,
      to: toParam ? `${toParam}T23:59:59+09:00` : null,
    };
  }
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  if (period === "year") return { from: `${y}-01-01T00:00:00+09:00`, to: null };
  // default: 이번 달
  const mm = String(m + 1).padStart(2, "0");
  return { from: `${y}-${mm}-01T00:00:00+09:00`, to: null };
}

export default async function SettlementLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const sp = await searchParams;
  const rawPeriod = (Array.isArray(sp.period) ? sp.period[0] : sp.period) ?? "month";
  const period: LedgerPeriod = (
    ["month", "year", "all", "custom"].includes(rawPeriod) ? rawPeriod : "month"
  ) as LedgerPeriod;
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const toParam = Array.isArray(sp.to) ? sp.to[0] : sp.to;
  const range = kstRange(period, fromParam, toParam);

  const admin = createAdminClient();

  // 지급이 끝난 정산 = "보낸 정산 내역" 장부.
  // ⚠ status='paid'만 보면 **잔액 출금으로 나간 지급이 통째로 빠진다**.
  // 출금이 잔액 경로로 일원화된 뒤 정산 행은 pending에 머물고 실제 이체는
  // withdrawal_requests·원장에만 남기 때문. 세무·회계용 장부라 누락은 치명적이라
  // 금액이 확정된 정산 전체를 가져와 원장 배분으로 지급 완료분을 가려낸다.
  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, project_id, dancer_id, gross_amount, withholding_rate, status, paid_at, paid_by, project:projects!settlements_project_id_fkey ( title )",
    )
    .in("status", ["pending", "paid"])
    .gt("gross_amount", 0);

  type Row = {
    id: string;
    project_id: string;
    dancer_id: string;
    gross_amount: number;
    withholding_rate: number;
    status: string;
    paid_at: string | null;
    paid_by: string | null;
    project: { title: string } | { title: string }[] | null;
  };
  const allRows = (sRows ?? []) as unknown as Row[];

  // 정산 건별 실제 지급 여부·지급일 (원장 FIFO 배분).
  const payoutBySettlement = new Map<string, SettlementPayout>();
  const allDancerIds = [...new Set(allRows.map((r) => r.dancer_id))];
  if (allDancerIds.length > 0) {
    const [{ data: ledgerRows }, { data: wrRows }] = await Promise.all([
      admin
        .from("dancer_ledger_entries")
        .select("dancer_id, entry_type, ref_type, ref_id, amount, created_at")
        .in("dancer_id", allDancerIds),
      admin
        .from("withdrawal_requests")
        .select("dancer_id, amount")
        .in("dancer_id", allDancerIds)
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
    for (const dancerId of allDancerIds) {
      const payouts = computeSettlementPayouts(
        ledgerByDancer.get(dancerId) ?? [],
        requestedByDancer.get(dancerId) ?? 0,
      );
      for (const [settlementId, payout] of payouts) {
        payoutBySettlement.set(settlementId, payout);
      }
    }
  }

  // 각 건의 실지급일 = 구 경로는 settlements.paid_at, 잔액 경로는 이체 시각.
  const paidAtOf = (r: Row): string | null =>
    r.status === "paid"
      ? r.paid_at
      : payoutBySettlement.get(r.id)?.paidAt ?? null;

  // 부분 지급 건은 세전·원천징수 칸을 전액 기준으로 쓸 수 없어 장부에서 제외하고,
  // 대신 화면에 몇 건·얼마가 빠졌는지 명시한다(조용한 누락 금지).
  const partial = allRows.filter((r) => {
    const p = payoutBySettlement.get(r.id);
    return r.status !== "paid" && p?.stage === "partially_paid";
  });
  const partialTotal = partial.reduce(
    (sum, r) => sum + (payoutBySettlement.get(r.id)?.paidAmount ?? 0),
    0,
  );

  const raw = allRows
    .filter((r) => {
      if (r.status !== "paid" && payoutBySettlement.get(r.id)?.stage !== "paid")
        return false;
      const paidAt = paidAtOf(r);
      if (!paidAt) return false;
      if (range.from && paidAt < range.from) return false;
      if (range.to && paidAt > range.to) return false;
      return true;
    })
    .sort((a, b) => (paidAtOf(b) ?? "").localeCompare(paidAtOf(a) ?? ""));

  // 댄서명 + 처리자명 매핑
  const dancerIds = [...new Set(raw.map((r) => r.dancer_id))];
  const adminIds = [...new Set(raw.map((r) => r.paid_by).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  const handlerById = new Map<string, string>();
  if (dancerIds.length > 0) {
    const { data: ds } = await admin
      .from("dancers")
      .select("id, stage_name")
      .in("id", dancerIds);
    for (const d of (ds ?? []) as Array<{ id: string; stage_name: string | null }>)
      nameById.set(d.id, d.stage_name ?? "(이름 없음)");
  }
  if (adminIds.length > 0) {
    const { data: ps } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", adminIds);
    for (const p of (ps ?? []) as Array<{ id: string; display_name: string | null }>)
      handlerById.set(p.id, p.display_name ?? "관리자");
  }

  const rows: LedgerRow[] = raw.map((r) => {
    const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
    const calc = calcSettlement(r.gross_amount, Number(r.withholding_rate));
    return {
      id: r.id,
      paidAt: paidAtOf(r),
      dancerName: nameById.get(r.dancer_id) ?? "(이름 없음)",
      projectTitle: proj?.title ?? "(공고)",
      gross: calc.gross,
      tax: calc.tax,
      net: calc.net,
      rate: calc.rate,
      handler: r.paid_by ? handlerById.get(r.paid_by) ?? "관리자" : "—",
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      gross: acc.gross + r.gross,
      tax: acc.tax + r.tax,
      net: acc.net + r.net,
    }),
    { count: 0, gross: 0, tax: 0, net: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 관리자</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            지급 장부 (보낸 정산)
          </h1>
          <Link
            href="/admin/settlements"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-secondary"
          >
            정산 처리 큐 →
          </Link>
        </div>
        <p className="text-sm text-ink-3">
          실제 지급이 끝난 정산의 장부예요. 잔액 출금으로 이체된 건도 함께
          집계합니다. 원천징수 3.3%는 국세청에 납부되는 세금(소득세 3% +
          지방소득세 0.3%)으로, 합계는 신고·회계에 참고하실 수 있어요.
        </p>
        {partial.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            일부만 지급된 정산 {partial.length}건(지급액 합계{" "}
            {partialTotal.toLocaleString("ko-KR")}원)은 세전·원천징수 금액을 전액
            기준으로 표기할 수 없어 아래 표에서 제외했어요. 잔여를 마저 지급하면
            자동으로 장부에 올라갑니다.
          </p>
        ) : null}
      </header>
      <SettlementLedger
        rows={rows}
        totals={totals}
        period={period}
        from={fromParam ?? null}
        to={toParam ?? null}
      />
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { createClient } from "@/lib/supabase/server";
import {
  PayoutHistory,
  type PayoutHistoryRow,
} from "@/components/settlement/PayoutHistory";
import { calcPayout, settlementRoleLabel } from "@/lib/settlement";
import {
  filterByKstPeriod,
  groupByKstMonth,
  kstPeriodRange,
  kstTodayParts,
  kstYear,
  parsePayoutPeriod,
  payoutPeriodLabel,
} from "@/lib/payout-schedule";

// GRIGO 화이트라벨 호스트: 탭 제목·공유 카드도 회사 명의로.
// (새 정산 화면을 만들 때마다 이 호출을 빠뜨리면 deetz 메타를 상속한다)
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata("GRIGO ENT 정산 내역");
}

type SettlementRow = {
  id: string;
  dancer_id: string;
  role: string;
  gross_amount: number | null;
  withholding_rate: number;
  tax_mode: string | null;
  vat_amount: number | null;
  paid_at: string | null;
  project: { title: string } | { title: string }[] | null;
};

type WithdrawalRow = {
  id: string;
  dancer_id: string;
  amount: number;
  paid_at: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
};

function one(str: string | string[] | undefined): string | undefined {
  return Array.isArray(str) ? str[0] : str;
}

export default async function SettlementHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const brand = await getBrand();
  const supabase = await createClient();

  const sp = await searchParams;
  const period = parsePayoutPeriod(one(sp.period), "year");
  const fromParam = one(sp.from) ?? null;
  const toParam = one(sp.to) ?? null;
  const rawYear = Number(one(sp.year));
  const thisYear = kstTodayParts().year;
  // 연도는 실재하는 범위만 허용 — 임의 값으로 무한 과거를 조회하게 두지 않는다.
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= thisYear
      ? rawYear
      : thisYear;

  // 본인 댄서 프로필만. 아래 두 조회는 RLS(본인 소유 dancer)로도 막히지만,
  // 필터를 명시해 "내 것만"을 코드에서도 분명히 한다.
  const { data: dancerRows } = await supabase
    .from("dancers")
    .select("id, stage_name")
    .eq("profile_id", user.id);
  const dancers = (dancerRows ?? []) as Array<{
    id: string;
    stage_name: string | null;
  }>;
  const dancerIds = dancers.map((d) => d.id);
  const nameById = new Map(
    dancers.map((d) => [d.id, d.stage_name ?? "내 프로필"]),
  );

  // 받은 돈의 원천은 둘이고 서로 겹치지 않는다.
  //  ① 구 경로: settlements(status=paid) — 정산 건별 출금(2026-08-17 신규 차단)
  //  ② 현 경로: withdrawal_requests(status=paid) — 잔액에서 부분 출금
  // 정산이 paid가 되면 원장에 earn+withdraw가 함께 남고, 잔액 출금은
  // withdraw만 남는다. 즉 두 원천 = 원장의 withdraw 전체이고 이중계상이 없다.
  let settlements: SettlementRow[] = [];
  let withdrawals: WithdrawalRow[] = [];
  if (dancerIds.length > 0) {
    const [{ data: sRows }, { data: wRows }] = await Promise.all([
      supabase
        .from("settlements")
        .select(
          "id, dancer_id, role, gross_amount, withholding_rate, tax_mode, vat_amount, paid_at, project:projects!settlements_project_id_fkey ( title )",
        )
        .in("dancer_id", dancerIds)
        .eq("status", "paid"),
      supabase
        .from("withdrawal_requests")
        .select("id, dancer_id, amount, paid_at, bank_name, bank_account_number")
        .in("dancer_id", dancerIds)
        .eq("status", "paid"),
    ]);
    settlements = (sRows ?? []) as unknown as SettlementRow[];
    withdrawals = (wRows ?? []) as unknown as WithdrawalRow[];
  }

  const settlementRows: PayoutHistoryRow[] = settlements
    .filter((r) => r.paid_at != null)
    .map((r) => {
      const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
      const base = proj?.title ?? "(공고)";
      // 실제 이체된 현금 기준 — 원장 미러 트리거와 같은 식(calcPayout).
      const payout = calcPayout({
        gross: r.gross_amount ?? 0,
        rate: Number(r.withholding_rate),
        taxMode: r.tax_mode,
        vatAmount: r.vat_amount,
      });
      return {
        id: r.id,
        source: "settlement" as const,
        paidAt: r.paid_at as string,
        amount: payout.transfer,
        title:
          r.role === "dancer" ? base : `${base} · ${settlementRoleLabel(r.role)}`,
        detail: null,
        gross: payout.gross,
        tax: payout.tax,
        vat: payout.vat,
        dancerName: nameById.get(r.dancer_id) ?? null,
      };
    });

  const withdrawalRows: PayoutHistoryRow[] = withdrawals
    .filter((r) => r.paid_at != null)
    .map((r) => {
      const no = r.bank_account_number ?? "";
      const account = [r.bank_name, no ? `***${no.slice(-4)}` : null]
        .filter(Boolean)
        .join(" ");
      return {
        id: r.id,
        source: "balance" as const,
        paidAt: r.paid_at as string,
        amount: Number(r.amount),
        title: "잔액 출금",
        detail: account || null,
        // 잔액은 정산 확정 시점에 이미 세후로 쌓인 돈이라 여기서의 세전·세금이 없다.
        gross: null,
        tax: null,
        vat: null,
        dancerName: nameById.get(r.dancer_id) ?? null,
      };
    });

  const allRows = [...settlementRows, ...withdrawalRows];
  const years = [
    ...new Set([thisYear, ...allRows.map((r) => kstYear(r.paidAt))]),
  ].sort((a, b) => b - a);

  const range = kstPeriodRange(period, {
    year,
    from: fromParam,
    to: toParam,
  });
  const inRange = filterByKstPeriod(allRows, range);
  const groups = groupByKstMonth(inRange);
  const total = inRange.reduce((sum, r) => sum + r.amount, 0);
  const periodLabel = payoutPeriodLabel(period, {
    year,
    from: fromParam,
    to: toParam,
  });

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex flex-col gap-1">
        {brand === "grigo" ? (
          <BrandLogo brand={brand} className="mb-2 h-8 w-auto" priority />
        ) : null}
        <Link
          href="/me/settlements"
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← 정산 · 출금
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">정산 내역</h1>
        <p className="text-sm text-ink-3">
          실제로 입금된 건만 기간별로 모아 봤어요. 잔액 출금은 정산 확정 시점에
          원천징수 3.3%가 이미 빠진 금액이라 세전·세금이 따로 표시되지 않아요.
        </p>
      </header>

      {dancerIds.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
          댄서 포트폴리오가 있어야 정산을 받을 수 있어요.{" "}
          <Link href="/me/portfolio" className="font-semibold text-primary">
            포트폴리오 만들기 →
          </Link>
        </div>
      ) : (
        <PayoutHistory
          groups={groups}
          total={total}
          count={inRange.length}
          period={period}
          year={year}
          years={years}
          from={fromParam}
          to={toParam}
          periodLabel={periodLabel}
          showDancerName={dancerIds.length > 1}
        />
      )}
    </div>
  );
}

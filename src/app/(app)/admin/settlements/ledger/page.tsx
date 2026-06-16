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

  // 지급(입금완료)된 정산 = "보낸 정산 내역" 장부.
  let q = admin
    .from("settlements")
    .select(
      "id, project_id, dancer_id, gross_amount, withholding_rate, paid_at, paid_by, project:projects!settlements_project_id_fkey ( title )",
    )
    .eq("status", "paid");
  if (range.from) q = q.gte("paid_at", range.from);
  if (range.to) q = q.lte("paid_at", range.to);
  const { data: sRows } = await q.order("paid_at", {
    ascending: false,
    nullsFirst: false,
  });

  type Row = {
    id: string;
    project_id: string;
    dancer_id: string;
    gross_amount: number;
    withholding_rate: number;
    paid_at: string | null;
    paid_by: string | null;
    project: { title: string } | { title: string }[] | null;
  };
  const raw = (sRows ?? []) as unknown as Row[];

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
      paidAt: r.paid_at,
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
          입금완료된 정산(실제 지급된 건)의 장부예요. 원천징수 3.3%는 국세청에
          납부되는 세금(소득세 3% + 지방소득세 0.3%)으로, 합계는 신고·회계에
          참고하실 수 있어요.
        </p>
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

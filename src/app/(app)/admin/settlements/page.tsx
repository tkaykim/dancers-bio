import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WithdrawalRequests,
  type WithdrawalRow,
} from "@/components/admin/WithdrawalRequests";
import type { SettlementStatus } from "@/lib/settlement";

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
  const nameById = new Map<string, string>();
  const acctById = new Map<
    string,
    { bank: string; number: string; holder: string } | null
  >();
  const docsById = new Map<string, { idCard: boolean; bankbook: boolean }>();
  const rrnById = new Map<string, string | null>();
  if (dancerIds.length > 0) {
    const { data: dRows } = await admin
      .from("dancers")
      .select("id, stage_name")
      .in("id", dancerIds);
    for (const d of (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
    }>)
      nameById.set(d.id, d.stage_name ?? "(이름 없음)");

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

  const list: WithdrawalRow[] = rows.map((r) => {
    const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
    const acct = acctById.get(r.dancer_id) ?? null;
    const doc = docsById.get(r.dancer_id) ?? { idCard: false, bankbook: false };
    return {
      id: r.id,
      projectId: r.project_id,
      dancerId: r.dancer_id,
      dancerName: nameById.get(r.dancer_id) ?? "(이름 없음)",
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
      </header>
      <WithdrawalRequests rows={list} />
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  MySettlements,
  type MySettlementRow,
  type PayoutAccount,
} from "@/components/settlement/MySettlements";
import type { DancerDocsState } from "@/components/settlement/DancerDocuments";
import type { SettlementStatus } from "@/lib/settlement";

export default async function MySettlementsPage() {
  const user = await requireUser();
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
  const accounts: Record<string, PayoutAccount | null> = {};
  const docs: Record<string, DancerDocsState> = {};

  if (dancerIds.length > 0) {
    const { data: sRows } = await supabase
      .from("settlements")
      .select(
        "id, dancer_id, gross_amount, withholding_rate, status, requested_at, paid_at, project:projects!settlements_project_id_fkey ( title )",
      )
      .in("dancer_id", dancerIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    type Row = {
      id: string;
      dancer_id: string;
      gross_amount: number;
      withholding_rate: number;
      status: SettlementStatus;
      requested_at: string | null;
      paid_at: string | null;
      project: { title: string } | { title: string }[] | null;
    };
    settlements = ((sRows ?? []) as unknown as Row[]).map((r) => {
      const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project;
      return {
        id: r.id,
        dancerId: r.dancer_id,
        dancerName: nameById.get(r.dancer_id) ?? "내 프로필",
        projectTitle: proj?.title ?? "(공고)",
        grossAmount: r.gross_amount,
        rate: Number(r.withholding_rate),
        status: r.status,
        paidAt: r.paid_at,
      };
    });

    const { data: piRows } = await supabase
      .from("dancer_private_info")
      .select(
        "dancer_id, bank_name, bank_account_number, bank_account_holder, id_card_path, bankbook_path",
      )
      .in("dancer_id", dancerIds);
    for (const id of dancerIds) {
      accounts[id] = null;
      docs[id] = { idCard: false, bankbook: false };
    }
    for (const pi of (piRows ?? []) as Array<{
      dancer_id: string;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_holder: string | null;
      id_card_path: string | null;
      bankbook_path: string | null;
    }>) {
      accounts[pi.dancer_id] =
        pi.bank_name && pi.bank_account_number && pi.bank_account_holder
          ? {
              bankName: pi.bank_name,
              accountNumber: pi.bank_account_number,
              accountHolder: pi.bank_account_holder,
            }
          : null;
      docs[pi.dancer_id] = {
        idCard: !!pi.id_card_path,
        bankbook: !!pi.bankbook_path,
      };
    }
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex flex-col gap-1">
        <Link
          href="/me"
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← 마이
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">정산 · 출금</h1>
        <p className="text-sm text-ink-3">
          확정된 정산금액과 출금 신청 현황이에요. 원천징수 3.3%를 뺀 금액이
          등록하신 계좌로 입금됩니다.
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
        <MySettlements
          settlements={settlements}
          accounts={accounts}
          docs={docs}
          dancerNames={Object.fromEntries(nameById)}
        />
      )}
    </div>
  );
}

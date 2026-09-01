import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canManageProject } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OwnerSettlementConsole,
  type OwnerSettlementRow,
} from "@/components/settlement/OwnerSettlementConsole";
import type { SettlementStatus } from "@/lib/settlement";
import {
  computeSettlementPayouts,
  type LedgerEntryInput,
  resolvePayoutStage,
  type SettlementPayout,
} from "@/lib/payout-state";
import { GRIGO_SETTLE_ORIGIN } from "@/lib/brand";
import { canManagePool, isAdminUser } from "@/lib/settlement-pool";

const SITE = "https://deetz.kr";

export default async function ProjectSettlementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await requireUser();
  if (!(await canManageProject(projectId))) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, owner_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  // 재무(수주액·실비)와 풀은 owner/admin 전용 — 공동관리자에겐 숨긴다(설계 §4.3).
  // 값도 공개 projects 컬럼이 아니라 project_finances·collections에서 읽는다.
  const [{ data: fin }, { data: coll }, poolAllowed] = await Promise.all([
    admin
      .from("project_finances")
      .select("client_revenue, expense_amount")
      .eq("project_id", projectId)
      .maybeSingle(),
    admin
      .from("project_settlement_collections")
      .select("collect_code, collection_open")
      .eq("project_id", projectId)
      .maybeSingle(),
    canManagePool(projectId, user.id),
  ]);
  const showFinance =
    (project.owner_id as string) === user.id || (await isAdminUser(user.id));

  // 매니저 콘솔은 직접비 role(출연료·교통비)만 다룬다 — 스태프·소개비는 admin 풀 화면 전용.
  // service-role 조회라 RLS를 우회하므로 앱 쿼리에서 직접 제한한다(설계 §4.2).
  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, dancer_id, role, gross_amount, withholding_rate, status, origin, created_at",
    )
    .eq("project_id", projectId)
    .in("role", ["dancer", "travel"])
    .order("created_at", { ascending: true });
  const settlements = (sRows ?? []) as Array<{
    id: string;
    dancer_id: string;
    role: string;
    gross_amount: number | null;
    withholding_rate: number;
    status: SettlementStatus;
    origin: string;
    created_at: string;
  }>;

  const dancerIds = [...new Set(settlements.map((s) => s.dancer_id))];
  const nameById = new Map<string, string>();
  const payoutById = new Map<string, { hasBank: boolean; hasRrn: boolean }>();
  if (dancerIds.length > 0) {
    const [{ data: dRows }, { data: piRows }] = await Promise.all([
      admin.from("dancers").select("id, stage_name").in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select(
          "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number",
        )
        .in("dancer_id", dancerIds),
    ]);
    for (const d of (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
    }>) {
      nameById.set(d.id, d.stage_name ?? "댄서");
    }
    for (const pi of (piRows ?? []) as Array<{
      dancer_id: string;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_holder: string | null;
      resident_registration_number: string | null;
    }>) {
      payoutById.set(pi.dancer_id, {
        hasBank: !!(
          pi.bank_name &&
          pi.bank_account_number &&
          pi.bank_account_holder
        ),
        hasRrn: !!pi.resident_registration_number,
      });
    }
  }

  // 지급 여부는 status로 알 수 없다(잔액 출금 이후에도 pending에 머문다).
  // 원장을 정산 건별로 배분해 실제 지급 단계를 계산한다.
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

  const rows: OwnerSettlementRow[] = settlements.map((s) => ({
    id: s.id,
    dancerId: s.dancer_id,
    dancerName: nameById.get(s.dancer_id) ?? "댄서",
    role: s.role,
    grossAmount: s.gross_amount,
    rate: Number(s.withholding_rate),
    status: s.status,
    origin: s.origin,
    hasBank: payoutById.get(s.dancer_id)?.hasBank ?? false,
    hasRrn: payoutById.get(s.dancer_id)?.hasRrn ?? false,
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
          href={`/projects/${projectId}/applicants`}
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← 프로젝트
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">정산 관리</h1>
          {poolAllowed ? (
            <Link
              href={`/admin/projects/${projectId}/pool`}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-ink-2 hover:bg-secondary"
            >
              프로젝트 풀 →
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-ink-3">{project.title as string}</p>
      </header>

      <OwnerSettlementConsole
        projectId={projectId}
        collectCode={(coll?.collect_code as string | null) ?? null}
        collectionOpen={coll?.collection_open === true}
        collectUrlBase={`${SITE}/settle/`}
        grigoUrlBase={`${GRIGO_SETTLE_ORIGIN}/settle/`}
        clientRevenue={(fin?.client_revenue as number | null) ?? null}
        expenseAmount={(fin?.expense_amount as number | null) ?? null}
        showFinance={showFinance}
        rows={rows}
      />
    </div>
  );
}

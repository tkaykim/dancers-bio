import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canManageProject } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OwnerSettlementConsole,
  type OwnerSettlementRow,
} from "@/components/settlement/OwnerSettlementConsole";
import type { SettlementStatus } from "@/lib/settlement";

const SITE = "https://deetz.kr";

export default async function ProjectSettlementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  await requireUser();
  if (!(await canManageProject(projectId))) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "id, title, settlement_collect_code, settlement_collection_open, client_revenue, expense_amount",
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, dancer_id, gross_amount, withholding_rate, status, origin, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  const settlements = (sRows ?? []) as Array<{
    id: string;
    dancer_id: string;
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

  const rows: OwnerSettlementRow[] = settlements.map((s) => ({
    id: s.id,
    dancerId: s.dancer_id,
    dancerName: nameById.get(s.dancer_id) ?? "댄서",
    grossAmount: s.gross_amount,
    rate: Number(s.withholding_rate),
    status: s.status,
    origin: s.origin,
    hasBank: payoutById.get(s.dancer_id)?.hasBank ?? false,
    hasRrn: payoutById.get(s.dancer_id)?.hasRrn ?? false,
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
        <h1 className="text-2xl font-bold tracking-tight">정산 관리</h1>
        <p className="text-sm text-ink-3">{project.title as string}</p>
      </header>

      <OwnerSettlementConsole
        projectId={projectId}
        collectCode={(project.settlement_collect_code as string | null) ?? null}
        collectionOpen={project.settlement_collection_open === true}
        collectUrlBase={`${SITE}/settle/`}
        clientRevenue={(project.client_revenue as number | null) ?? null}
        expenseAmount={(project.expense_amount as number | null) ?? null}
        rows={rows}
      />
    </div>
  );
}

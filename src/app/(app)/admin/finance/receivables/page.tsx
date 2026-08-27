import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BILLABLE_LINE_STATUSES,
  isLineOverdue,
  lineBilledTotal,
  todayYmdKst,
  type DealPricingModel,
  type DealStatus,
  type RevenueLineStatus,
  type RevenueLineType,
} from "@/lib/receivables";
import {
  ReceivablesConsole,
  type DealDto,
  type LineDto,
  type PartyDto,
  type ProjectOption,
  type ReceiptDto,
} from "@/components/admin/receivables/ReceivablesConsole";

export const dynamic = "force-dynamic";

// 받을 돈(매출채권) 콘솔 — 설계 정본 docs/design-client-receivables.md rev1.
// 경영지원실(admin) 전용(대표 결정 3). 테이블 RLS default-deny라 service-role로만 읽는다.
export default async function ReceivablesPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [
    { data: dealRows },
    { data: lineRows },
    { data: receiptRows },
    { data: partyRows },
    { data: projectRows },
  ] = await Promise.all([
    admin
      .from("project_client_deals")
      .select("*")
      .order("created_at", { ascending: false }),
    admin
      .from("deal_revenue_lines")
      .select("*")
      .order("created_at", { ascending: true }),
    admin
      .from("deal_receipts")
      .select("*")
      .order("received_on", { ascending: true }),
    admin
      .from("client_parties")
      .select("id, name, business_registration_number")
      .order("name", { ascending: true }),
    admin
      .from("projects")
      .select("id, short_code, title, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  type DealRow = {
    id: string;
    project_id: string;
    client_party_id: string | null;
    client_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    pricing_model: DealPricingModel;
    unit_price: number | null;
    unit_label: string | null;
    quantity_cap: number | null;
    quantity_min: number | null;
    min_guarantee_amount: number | null;
    revenue_share_pct: number | null;
    revenue_share_base: string | null;
    expected_supply_amount: number | null;
    vat_mode: string;
    payment_terms: string | null;
    contract_signed_at: string | null;
    contract_doc_url: string | null;
    agreement_basis: string | null;
    status: DealStatus;
    memo: string | null;
  };
  type LineRow = {
    id: string;
    deal_id: string;
    line_type: RevenueLineType;
    title: string;
    quantity: number | null;
    unit_price: number | null;
    supply_amount: number;
    vat_amount: number;
    status: RevenueLineStatus;
    due_date: string | null;
    invoice_issued_at: string | null;
    received_at: string | null;
    memo: string | null;
  };
  type ReceiptRow = {
    id: string;
    deal_id: string;
    line_id: string | null;
    amount: number;
    received_on: string;
    method: string | null;
    clobe_tx_id: string | null;
    memo: string | null;
  };

  const deals = (dealRows ?? []) as DealRow[];
  const lines = (lineRows ?? []) as LineRow[];
  const receipts = (receiptRows ?? []) as ReceiptRow[];

  const projectById = new Map<string, { short_code: string; title: string }>();
  for (const p of (projectRows ?? []) as Array<{
    id: string;
    short_code: string;
    title: string;
  }>) {
    projectById.set(p.id, { short_code: p.short_code, title: p.title });
  }
  // 딜이 참조하는 프로젝트가 최근 200건 밖이면 개별 보충 조회.
  const missing = [
    ...new Set(
      deals.map((d) => d.project_id).filter((id) => !projectById.has(id)),
    ),
  ];
  if (missing.length > 0) {
    const { data: extra } = await admin
      .from("projects")
      .select("id, short_code, title")
      .in("id", missing);
    for (const p of (extra ?? []) as Array<{
      id: string;
      short_code: string;
      title: string;
    }>) {
      projectById.set(p.id, { short_code: p.short_code, title: p.title });
    }
  }

  // 단가×수량 딜의 수량 힌트(설계 §5) — 제안값일 뿐 확정은 사람이.
  const hintProjectIds = [
    ...new Set(
      deals
        .filter(
          (d) =>
            d.pricing_model === "per_unit" ||
            d.pricing_model === "min_guarantee_plus_unit",
        )
        .map((d) => d.project_id),
    ),
  ];
  const hintsByProject = new Map<
    string,
    { dancerRows: number; submissions: number; checkedIn: number }
  >();
  if (hintProjectIds.length > 0) {
    const [{ data: sRows }, { data: subRows }, { data: evRows }] =
      await Promise.all([
        admin
          .from("settlements")
          .select("project_id, status, role")
          .in("project_id", hintProjectIds),
        admin
          .from("project_submissions")
          .select("id, project_id, application_id, instagram_handle")
          .in("project_id", hintProjectIds),
        admin
          .from("project_events")
          .select("id, project_id")
          .in("project_id", hintProjectIds),
      ]);
    const eventIds = ((evRows ?? []) as Array<{ id: string }>).map((e) => e.id);
    const eventProject = new Map<string, string>();
    for (const e of (evRows ?? []) as Array<{ id: string; project_id: string }>)
      eventProject.set(e.id, e.project_id);
    let partRows: Array<{ event_id: string; attendance_status: string | null }> =
      [];
    if (eventIds.length > 0) {
      const { data } = await admin
        .from("event_participants")
        .select("event_id, attendance_status")
        .in("event_id", eventIds);
      partRows = (data ?? []) as typeof partRows;
    }
    for (const pid of hintProjectIds) {
      const dancerRows = ((sRows ?? []) as Array<{
        project_id: string;
        status: string;
        role: string;
      }>).filter(
        (s) =>
          s.project_id === pid && s.role === "dancer" && s.status !== "cancelled",
      ).length;
      // 제출 수는 재업로드 중복을 제거한 제출자 기준(지원서 → 인스타핸들 → 행 id 순 키).
      const submissions = new Set(
        ((subRows ?? []) as Array<{
          id: string;
          project_id: string;
          application_id: string | null;
          instagram_handle: string | null;
        }>)
          .filter((s) => s.project_id === pid)
          .map((s) => s.application_id ?? s.instagram_handle ?? s.id),
      ).size;
      const checkedIn = partRows.filter(
        (r) =>
          eventProject.get(r.event_id) === pid &&
          r.attendance_status === "checked_in",
      ).length;
      hintsByProject.set(pid, { dancerRows, submissions, checkedIn });
    }
  }

  const today = todayYmdKst();
  const linesByDeal = new Map<string, LineRow[]>();
  for (const l of lines) {
    const arr = linesByDeal.get(l.deal_id) ?? [];
    arr.push(l);
    linesByDeal.set(l.deal_id, arr);
  }
  const receiptsByDeal = new Map<string, ReceiptRow[]>();
  const receiptSumByLine = new Map<string, number>();
  for (const r of receipts) {
    const arr = receiptsByDeal.get(r.deal_id) ?? [];
    arr.push(r);
    receiptsByDeal.set(r.deal_id, arr);
    if (r.line_id)
      receiptSumByLine.set(
        r.line_id,
        (receiptSumByLine.get(r.line_id) ?? 0) + r.amount,
      );
  }

  const dealDtos: DealDto[] = deals.map((d) => {
    const proj = projectById.get(d.project_id);
    const dealLines: LineDto[] = (linesByDeal.get(d.id) ?? []).map((l) => ({
      ...l,
      receipts_sum: receiptSumByLine.get(l.id) ?? 0,
      overdue: isLineOverdue(l, today),
    }));
    const dealReceipts: ReceiptDto[] = receiptsByDeal.get(d.id) ?? [];
    const billable = dealLines.filter((l) =>
      BILLABLE_LINE_STATUSES.includes(l.status),
    );
    const billedSupply = billable.reduce((t, l) => t + l.supply_amount, 0);
    const billedTotal = billable.reduce((t, l) => t + lineBilledTotal(l), 0);
    const receiptsSum = dealReceipts.reduce((t, r) => t + r.amount, 0);
    const unallocated = dealReceipts
      .filter((r) => !r.line_id)
      .reduce((t, r) => t + r.amount, 0);
    return {
      ...d,
      project_short_code: proj?.short_code ?? null,
      project_title: proj?.title ?? "(삭제되었거나 접근 불가한 프로젝트)",
      lines: dealLines,
      receipts: dealReceipts,
      billed_supply: billedSupply,
      billed_total: billedTotal,
      receipts_sum: receiptsSum,
      outstanding: billedTotal - receiptsSum,
      unallocated_receipts: unallocated,
      overdue_count: dealLines.filter((l) => l.overdue).length,
      hints: hintsByProject.get(d.project_id) ?? null,
    };
  });

  const parties: PartyDto[] = ((partyRows ?? []) as PartyDto[]).map((p) => ({
    id: p.id,
    name: p.name,
    business_registration_number: p.business_registration_number,
  }));
  const projectOptions: ProjectOption[] = ((projectRows ?? []) as Array<{
    id: string;
    short_code: string;
    title: string;
  }>).map((p) => ({ id: p.id, short_code: p.short_code, title: p.title }));

  return (
    <ReceivablesConsole
      deals={dealDtos}
      parties={parties}
      projects={projectOptions}
      today={today}
    />
  );
}

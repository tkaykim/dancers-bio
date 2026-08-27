"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";
import {
  LINE_STATUS_LABELS,
  type RevenueLineStatus,
} from "@/lib/receivables";

// 매출채권(받을 돈) 액션 — 설계 정본 docs/design-client-receivables.md rev1.
// 전부 requireAdmin(경영지원실 전용, 대표 결정 3) + service-role(테이블 RLS default-deny).
// 불변식(수납 라인 불변·입금 append-only·수납 전환=입금 합계)은 DB 트리거가 최종 방어선이고,
// 여기서는 같은 규칙을 선검사해 사람이 읽을 수 있는 오류로 돌려준다.

const RECEIVABLES_PATH = "/admin/finance/receivables";

function parseAmount(
  v: FormDataEntryValue | null,
  opts: { allowNegative?: boolean; allowZero?: boolean } = {},
): number | null {
  const t = (v ?? "").toString().replace(/[,\s원]/g, "").trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  if (!Number.isFinite(n)) return null;
  if (!opts.allowNegative && n < 0) return null;
  if (!opts.allowZero && n === 0) return null;
  if (Math.abs(n) > 100_000_000_000) return null; // 1,000억 상한(오타 방어)
  return n;
}

function str(v: FormDataEntryValue | null): string {
  return (v ?? "").toString().trim();
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const t = str(v);
  return t ? t : null;
}

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── 거래처 마스터 ───────────────────────────────────────────────────────────

const partySchema = z.object({
  name: z.string().min(1).max(120),
  business_registration_number: z
    .string()
    .regex(/^\d{10}$/)
    .nullable(),
  aliases: z.array(z.string().min(1).max(60)).max(10),
  default_contact_name: z.string().max(80).nullable(),
  default_contact_email: z.string().email().nullable(),
  default_contact_phone: z.string().max(40).nullable(),
  memo: z.string().max(2000).nullable(),
});

export async function createClientPartyAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const brnDigits = str(fd.get("business_registration_number")).replace(
    /\D/g,
    "",
  );
  const parsed = partySchema.safeParse({
    name: str(fd.get("name")),
    business_registration_number: brnDigits ? brnDigits : null,
    aliases: str(fd.get("aliases"))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    default_contact_name: strOrNull(fd.get("default_contact_name")),
    default_contact_email: strOrNull(fd.get("default_contact_email")),
    default_contact_phone: strOrNull(fd.get("default_contact_phone")),
    memo: strOrNull(fd.get("memo")),
  });
  if (!parsed.success)
    return { ok: false, error: "거래처 입력값을 확인해 주세요. (사업자번호는 숫자 10자리)" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_parties")
    .insert({ ...parsed.data })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "같은 사업자번호의 거래처가 이미 있습니다." };
    return { ok: false, error: error.message };
  }
  void profile;
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true, data: { id: data.id as string } };
}

// ── 딜(계약 단위) ───────────────────────────────────────────────────────────

const dealSchema = z
  .object({
    project_id: uuid,
    client_party_id: uuid.nullable(),
    client_name: z.string().min(1).max(120),
    contact_name: z.string().max(80).nullable(),
    contact_email: z.string().email().nullable(),
    contact_phone: z.string().max(40).nullable(),
    pricing_model: z.enum([
      "fixed",
      "per_unit",
      "min_guarantee_plus_unit",
      "revenue_share",
      "composite",
    ]),
    unit_price: z.number().int().positive().nullable(),
    unit_label: z.string().max(80).nullable(),
    quantity_cap: z.number().int().positive().max(1_000_000).nullable(),
    quantity_min: z.number().int().positive().max(1_000_000).nullable(),
    min_guarantee_amount: z.number().int().positive().nullable(),
    revenue_share_pct: z.number().min(0).max(100).nullable(),
    revenue_share_base: z.string().max(500).nullable(),
    expected_supply_amount: z.number().int().positive().nullable(),
    vat_mode: z.enum(["vat_excluded", "vat_included", "tax_free"]),
    payment_terms: z.string().max(300).nullable(),
    contract_signed_at: ymd.nullable(),
    contract_doc_url: z.string().max(500).nullable(),
    agreement_basis: z.string().max(500).nullable(),
    status: z.enum(["negotiating", "active", "completed", "cancelled"]),
    memo: z.string().max(2000).nullable(),
  })
  .superRefine((d, ctx) => {
    if (
      (d.pricing_model === "per_unit" ||
        d.pricing_model === "min_guarantee_plus_unit") &&
      d.unit_price == null
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "단가형 계약은 단가가 필요합니다.",
      });
    if (d.pricing_model === "revenue_share" && d.revenue_share_pct == null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "매출 배분 계약은 배분율(%)이 필요합니다.",
      });
  });

type DealFormParse =
  | { ok: false; error: string }
  | { ok: true; data: z.infer<typeof dealSchema> };

async function parseDealForm(fd: FormData): Promise<DealFormParse> {
  const admin = createAdminClient();
  const partyId = strOrNull(fd.get("client_party_id"));
  let clientName = str(fd.get("client_name"));
  if (partyId) {
    const { data: party } = await admin
      .from("client_parties")
      .select("name")
      .eq("id", partyId)
      .maybeSingle();
    if (!party) return { ok: false, error: "거래처를 찾을 수 없습니다." };
    clientName = party.name as string;
  }
  const pctRaw = str(fd.get("revenue_share_pct"));
  const parsed = dealSchema.safeParse({
    project_id: str(fd.get("project_id")),
    client_party_id: partyId,
    client_name: clientName,
    contact_name: strOrNull(fd.get("contact_name")),
    contact_email: strOrNull(fd.get("contact_email")),
    contact_phone: strOrNull(fd.get("contact_phone")),
    pricing_model: str(fd.get("pricing_model")),
    unit_price: parseAmount(fd.get("unit_price")),
    unit_label: strOrNull(fd.get("unit_label")),
    quantity_cap: parseAmount(fd.get("quantity_cap")),
    quantity_min: parseAmount(fd.get("quantity_min")),
    min_guarantee_amount: parseAmount(fd.get("min_guarantee_amount")),
    revenue_share_pct: pctRaw ? Number(pctRaw) : null,
    revenue_share_base: strOrNull(fd.get("revenue_share_base")),
    expected_supply_amount: parseAmount(fd.get("expected_supply_amount")),
    vat_mode: str(fd.get("vat_mode")) || "vat_excluded",
    payment_terms: strOrNull(fd.get("payment_terms")),
    contract_signed_at: strOrNull(fd.get("contract_signed_at")),
    contract_doc_url: strOrNull(fd.get("contract_doc_url")),
    agreement_basis: strOrNull(fd.get("agreement_basis")),
    status: str(fd.get("status")) || "active",
    memo: strOrNull(fd.get("memo")),
  });
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    const msg: string =
      typeof custom?.message === "string" && custom.message
        ? custom.message
        : "계약 입력값을 확인해 주세요. (프로젝트·거래처명·계약 유형은 필수)";
    return { ok: false, error: msg };
  }
  return { ok: true, data: parsed.data };
}

export async function createDealAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const r = await parseDealForm(fd);
  if (!r.ok) return { ok: false, error: r.error };

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", r.data.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };

  const { data, error } = await admin
    .from("project_client_deals")
    .insert({ ...r.data, created_by: profile.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateDealAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const dealId = str(fd.get("deal_id"));
  if (!uuid.safeParse(dealId).success)
    return { ok: false, error: "잘못된 요청입니다." };
  const r = await parseDealForm(fd);
  if (!r.ok) return { ok: false, error: r.error };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("project_client_deals")
    .select("id, project_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "계약을 찾을 수 없습니다." };
  if ((existing.project_id as string) !== r.data.project_id)
    return { ok: false, error: "계약의 프로젝트는 변경할 수 없습니다." };

  const { error } = await admin
    .from("project_client_deals")
    .update({ ...r.data })
    .eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true };
}

// ── 청구 라인 ───────────────────────────────────────────────────────────────

const LINE_TYPES = [
  "base",
  "installment",
  "unit_billing",
  "option",
  "expense_rebill",
  "revenue_share",
  "adjustment",
] as const;

export async function createLineAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const dealId = str(fd.get("deal_id"));
  const lineType = str(fd.get("line_type")) as (typeof LINE_TYPES)[number];
  const title = str(fd.get("title"));
  const initialStatus = str(fd.get("status")) === "confirmed" ? "confirmed" : "draft";
  const dueDate = strOrNull(fd.get("due_date"));
  const memo = strOrNull(fd.get("memo"));
  if (!uuid.safeParse(dealId).success || !LINE_TYPES.includes(lineType) || !title)
    return { ok: false, error: "매출 입력값을 확인해 주세요." };
  if (dueDate && !ymd.safeParse(dueDate).success)
    return { ok: false, error: "수금 예정일 형식이 잘못됐습니다." };

  const isAdjustment = lineType === "adjustment";
  const qtyRaw = str(fd.get("quantity"));
  const quantity = qtyRaw ? Number(qtyRaw) : null;
  const unitPrice = parseAmount(fd.get("unit_price"));
  let supply = parseAmount(fd.get("supply_amount"), {
    allowNegative: isAdjustment,
  });
  const vat = parseAmount(fd.get("vat_amount"), {
    allowNegative: isAdjustment,
    allowZero: true,
  });

  if (lineType === "unit_billing") {
    if (
      quantity == null ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      unitPrice == null
    )
      return { ok: false, error: "단가×수량 매출은 수량과 단가가 필요합니다." };
    supply = Math.round(quantity * unitPrice); // 금액은 서버가 계산(불일치 방지)
  }
  if (supply == null)
    return { ok: false, error: "공급가액(원)을 입력해 주세요." };

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("project_client_deals")
    .select("id, quantity_cap, vat_mode")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return { ok: false, error: "계약을 찾을 수 없습니다." };
  if (
    lineType === "unit_billing" &&
    deal.quantity_cap != null &&
    quantity != null &&
    quantity > (deal.quantity_cap as number)
  )
    return {
      ok: false,
      error: `수량이 계약 상한(${deal.quantity_cap})을 초과합니다.`,
    };

  const vatAmount =
    vat != null
      ? vat
      : (deal.vat_mode as string) === "tax_free"
        ? 0
        : Math.round(supply * 0.1);

  const { data, error } = await admin
    .from("deal_revenue_lines")
    .insert({
      deal_id: dealId,
      line_type: lineType,
      title,
      quantity: lineType === "unit_billing" ? quantity : null,
      unit_price: lineType === "unit_billing" ? unitPrice : null,
      supply_amount: supply,
      vat_amount: vatAmount,
      status: initialStatus,
      due_date: dueDate,
      memo,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateLineAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const lineId = str(fd.get("line_id"));
  if (!uuid.safeParse(lineId).success)
    return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("deal_revenue_lines")
    .select("id, status, line_type")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "매출 항목을 찾을 수 없습니다." };
  if (line.status !== "draft" && line.status !== "confirmed")
    return {
      ok: false,
      error:
        "세금계산서 발행·수금 완료 후에는 금액을 수정할 수 없습니다. '조정(차감·에누리)' 항목을 추가해 주세요.",
    };

  const isAdjustment = (line.line_type as string) === "adjustment";
  const title = str(fd.get("title"));
  const supply = parseAmount(fd.get("supply_amount"), {
    allowNegative: isAdjustment,
  });
  const vat = parseAmount(fd.get("vat_amount"), {
    allowNegative: isAdjustment,
    allowZero: true,
  });
  const dueDate = strOrNull(fd.get("due_date"));
  if (!title || supply == null || vat == null)
    return { ok: false, error: "매출 입력값을 확인해 주세요." };
  if (dueDate && !ymd.safeParse(dueDate).success)
    return { ok: false, error: "수금 예정일 형식이 잘못됐습니다." };

  const qtyRaw = str(fd.get("quantity"));
  const quantity = qtyRaw ? Number(qtyRaw) : null;
  const unitPrice = parseAmount(fd.get("unit_price"));
  const patch: Record<string, unknown> = {
    title,
    supply_amount: supply,
    vat_amount: vat,
    due_date: dueDate,
    memo: strOrNull(fd.get("memo")),
  };
  if ((line.line_type as string) === "unit_billing") {
    if (quantity == null || quantity <= 0 || unitPrice == null)
      return { ok: false, error: "단가×수량 매출은 수량과 단가가 필요합니다." };
    patch.quantity = quantity;
    patch.unit_price = unitPrice;
    patch.supply_amount = Math.round(quantity * unitPrice);
  }

  const { error } = await admin
    .from("deal_revenue_lines")
    .update(patch)
    .eq("id", lineId)
    .in("status", ["draft", "confirmed"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true };
}

const LINE_TRANSITIONS: Record<string, RevenueLineStatus[]> = {
  // 현재 상태 → 이동 가능 상태. received 진입은 입금 합계 충족 시 DB가 허용(수동 전환도 검증됨).
  draft: ["confirmed", "invoiced", "cancelled"],
  confirmed: ["draft", "invoiced", "cancelled"],
  invoiced: ["cancelled"],
};

export async function setLineStatusAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const lineId = str(fd.get("line_id"));
  const next = str(fd.get("next_status")) as RevenueLineStatus;
  const invoiceDate = strOrNull(fd.get("invoice_issued_at"));
  const dueDate = strOrNull(fd.get("due_date"));
  if (!uuid.safeParse(lineId).success)
    return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("deal_revenue_lines")
    .select("id, status")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "매출 항목을 찾을 수 없습니다." };
  const allowed = LINE_TRANSITIONS[line.status as string] ?? [];
  if (!allowed.includes(next))
    return {
      ok: false,
      error: `'${LINE_STATUS_LABELS[line.status as RevenueLineStatus] ?? line.status}' 상태에서는 '${LINE_STATUS_LABELS[next] ?? next}'(으)로 바꿀 수 없습니다.`,
    };
  if (next === "invoiced") {
    const issued = invoiceDate ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    if (!ymd.safeParse(issued).success)
      return { ok: false, error: "세금계산서 발행일 형식이 잘못됐습니다." };
    const patch: Record<string, unknown> = {
      status: "invoiced",
      invoice_issued_at: issued,
    };
    if (dueDate) {
      if (!ymd.safeParse(dueDate).success)
        return { ok: false, error: "수금 예정일 형식이 잘못됐습니다." };
      patch.due_date = dueDate;
    }
    const { error } = await admin
      .from("deal_revenue_lines")
      .update(patch)
      .eq("id", lineId)
      .eq("status", line.status as string);
    if (error) return { ok: false, error: error.message };
  } else {
    const patch: Record<string, unknown> = { status: next };
    if (next === "draft" || next === "confirmed") patch.invoice_issued_at = null;
    const { error } = await admin
      .from("deal_revenue_lines")
      .update(patch)
      .eq("id", lineId)
      .eq("status", line.status as string);
    if (error) {
      if (error.message.includes("CANCEL_HAS_RECEIPTS"))
        return {
          ok: false,
          error:
            "수금 내역이 있는 매출은 취소할 수 없습니다. 환불(음수 수금)로 잔액 0원을 만든 뒤 취소해 주세요.",
        };
      return { ok: false, error: error.message };
    }
  }
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true };
}

export async function deleteLineAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const lineId = str(fd.get("line_id"));
  if (!uuid.safeParse(lineId).success)
    return { ok: false, error: "잘못된 요청입니다." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("deal_revenue_lines")
    .delete()
    .eq("id", lineId)
    .in("status", ["draft", "cancelled"]);
  if (error) {
    if (error.message.includes("LINE_NO_DELETE"))
      return {
        ok: false,
        error: "수금 내역이 있거나 계산서 발행·수금 완료된 매출은 삭제할 수 없습니다.",
      };
    return { ok: false, error: error.message };
  }
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true };
}

// ── 입금 기록 (append-only) ─────────────────────────────────────────────────

export async function addReceiptAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const dealId = str(fd.get("deal_id"));
  const lineId = strOrNull(fd.get("line_id"));
  const amount = parseAmount(fd.get("amount"), { allowNegative: true });
  const receivedOn = str(fd.get("received_on"));
  if (!uuid.safeParse(dealId).success)
    return { ok: false, error: "잘못된 요청입니다." };
  if (lineId && !uuid.safeParse(lineId).success)
    return { ok: false, error: "잘못된 매출 항목입니다." };
  if (amount == null || amount === 0)
    return { ok: false, error: "수금액(원)을 입력해 주세요. 환불·회수는 음수로." };
  if (!ymd.safeParse(receivedOn).success)
    return { ok: false, error: "수금일 형식이 잘못됐습니다. (YYYY-MM-DD)" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_receipts")
    .insert({
      deal_id: dealId,
      line_id: lineId,
      amount,
      received_on: receivedOn,
      method: strOrNull(fd.get("method")) ?? "bank_transfer",
      clobe_tx_id: strOrNull(fd.get("clobe_tx_id")),
      memo: strOrNull(fd.get("memo")),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("RECEIPT_DEAL_MISMATCH"))
      return { ok: false, error: "선택한 매출 항목이 이 계약의 항목이 아닙니다." };
    return { ok: false, error: error.message };
  }
  revalidatePath(RECEIVABLES_PATH);
  return { ok: true, data: { id: data.id as string } };
}

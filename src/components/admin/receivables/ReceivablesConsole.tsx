"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClientPartyAction,
  createDealAction,
  updateDealAction,
  createLineAction,
  createMixedUnitLinesAction,
  recordTaxInvoiceAction,
  updateLineAction,
  setLineStatusAction,
  deleteLineAction,
  addReceiptAction,
} from "@/app/actions/receivables";
import {
  calculateUnitPricing,
  DEAL_STATUS_LABELS,
  LINE_STATUS_LABELS,
  LINE_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  dealTermsSummary,
  type DealPricingModel,
  type DealStatus,
  type RevenueLineStatus,
  type RevenueLineType,
} from "@/lib/receivables";
import { formatWon } from "@/lib/settlement";

// 받을 돈(매출채권) 콘솔 UI — 설계 정본 docs/design-client-receivables.md §8 Phase B.
// 조회·집계는 서버(page.tsx), 여기서는 렌더 + 액션 호출만.

export type LineDto = {
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
  tax_invoice_id: string | null;
  received_at: string | null;
  memo: string | null;
  receipts_sum: number;
  overdue: boolean;
};

export type ReceiptDto = {
  id: string;
  deal_id: string;
  line_id: string | null;
  amount: number;
  received_on: string;
  method: string | null;
  clobe_tx_id: string | null;
  memo: string | null;
};

export type TaxInvoiceDto = {
  id: string;
  deal_id: string;
  issued_on: string;
  due_date: string | null;
  supply_amount: number;
  vat_amount: number;
  external_reference: string | null;
  document_url: string | null;
  memo: string | null;
};

export type DealDto = {
  id: string;
  project_id: string;
  project_short_code: string | null;
  project_title: string;
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
  lines: LineDto[];
  tax_invoices: TaxInvoiceDto[];
  receipts: ReceiptDto[];
  billed_supply: number;
  billed_total: number;
  receipts_sum: number;
  outstanding: number;
  unallocated_receipts: number;
  overdue_count: number;
  hints: { dancerRows: number; submissions: number; checkedIn: number } | null;
};

export type PartyDto = {
  id: string;
  name: string;
  business_registration_number: string | null;
};

export type ProjectOption = { id: string; short_code: string; title: string };

function formatMoneyText(v: string): string {
  const neg = v.trim().startsWith("-");
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return neg ? "-" : "";
  return (neg ? "-" : "") + Number(digits).toLocaleString("ko-KR");
}

function MoneyInput(props: {
  name: string;
  defaultValue?: number | null;
  // 제어 모드(부가세 자동 계산 등 연동 필드용): value + onValueChange를 함께 넘긴다.
  value?: string;
  onValueChange?: (formatted: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [inner, setInner] = useState(
    props.defaultValue != null
      ? Math.round(props.defaultValue).toLocaleString("ko-KR")
      : "",
  );
  const controlled = props.value !== undefined;
  const v = controlled ? (props.value as string) : inner;
  return (
    <input
      name={props.name}
      value={v}
      required={props.required}
      onChange={(e) => {
        const f = formatMoneyText(e.target.value);
        if (controlled) props.onValueChange?.(f);
        else setInner(f);
      }}
      inputMode="numeric"
      placeholder={props.placeholder ?? "0"}
      className={
        props.className ??
        "w-full rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm"
      }
    />
  );
}

function moneyToNumber(s: string): number {
  const neg = s.trim().startsWith("-");
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return (neg ? -1 : 1) * Number(digits);
}

function formatMoneyNumber(n: number | null | undefined): string {
  return n != null ? Math.round(n).toLocaleString("ko-KR") : "";
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    date,
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm";
const labelCls = "text-xs font-medium text-ink-3";
const btnPrimary =
  "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-hairline-2 px-3 py-2 text-sm font-medium text-ink-2 hover:text-foreground disabled:opacity-50";
const btnMini =
  "rounded-md border border-hairline-2 px-2 py-1 text-xs font-medium text-ink-2 hover:text-foreground disabled:opacity-50";

function LineStatusBadge({ line }: { line: LineDto }) {
  const tone: Record<RevenueLineStatus, string> = {
    draft: "bg-secondary text-ink-2",
    confirmed: "bg-blue-500/10 text-blue-600",
    invoiced: "bg-amber-500/10 text-amber-600",
    received: "bg-emerald-500/10 text-emerald-600",
    cancelled: "bg-secondary text-ink-4 line-through",
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[line.status]}`}
      >
        {LINE_STATUS_LABELS[line.status]}
      </span>
      {line.overdue ? (
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600">
          연체
        </span>
      ) : null}
    </span>
  );
}

// ── 거래처 등록 폼 ──────────────────────────────────────────────────────────

function NewPartyForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const res = await createClientPartyAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      <div className="flex flex-col gap-1">
        <label className={labelCls}>상호 (법인명) *</label>
        <input
          name="name"
          required
          className={inputCls}
          placeholder="주식회사 ○○"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>사업자등록번호 (숫자 10자리)</label>
        <input
          name="business_registration_number"
          className={inputCls}
          placeholder="0000000000"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>검색 별칭 (쉼표 구분)</label>
        <input name="aliases" className={inputCls} placeholder="약칭, 영문명" />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>기본 담당자</label>
        <input name="default_contact_name" className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>담당자 이메일</label>
        <input name="default_contact_email" type="email" className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>담당자 연락처</label>
        <input name="default_contact_phone" className={inputCls} />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>메모</label>
        <input name="memo" className={inputCls} />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-2">{err}</p> : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          거래처 등록
        </button>
      </div>
    </form>
  );
}

// ── 딜 등록/수정 폼 ─────────────────────────────────────────────────────────

function DealForm({
  parties,
  projects,
  deal,
  onDone,
}: {
  parties: PartyDto[];
  projects: ProjectOption[];
  deal?: DealDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [model, setModel] = useState<DealPricingModel>(
    deal?.pricing_model ?? "fixed",
  );
  const [partyId, setPartyId] = useState(deal?.client_party_id ?? "");
  const isEdit = !!deal;
  const showUnit = model === "per_unit" || model === "min_guarantee_plus_unit";

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const res = isEdit
            ? await updateDealAction(fd)
            : await createDealAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      {isEdit ? <input type="hidden" name="deal_id" value={deal.id} /> : null}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>프로젝트 *</label>
        {isEdit ? (
          <>
            <input type="hidden" name="project_id" value={deal.project_id} />
            <p className="text-sm text-ink-2">{deal.project_title}</p>
          </>
        ) : (
          <select
            name="project_id"
            required
            className={inputCls}
            defaultValue=""
          >
            <option value="" disabled>
              프로젝트 선택
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.short_code}] {p.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>거래처 (마스터)</label>
        <select
          name="client_party_id"
          className={inputCls}
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
        >
          <option value="">직접 입력</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.business_registration_number
                ? ` (${p.business_registration_number})`
                : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>
          거래처 표시명 {partyId ? "(마스터 사용)" : "*"}
        </label>
        <input
          name="client_name"
          className={inputCls}
          defaultValue={deal?.client_name ?? ""}
          disabled={!!partyId}
          required={!partyId}
          placeholder="주식회사 ○○"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>거래처 담당자</label>
        <input
          name="contact_name"
          className={inputCls}
          defaultValue={deal?.contact_name ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>담당자 이메일</label>
        <input
          name="contact_email"
          type="email"
          className={inputCls}
          defaultValue={deal?.contact_email ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>계약 유형 *</label>
        <select
          name="pricing_model"
          className={inputCls}
          value={model}
          onChange={(e) => setModel(e.target.value as DealPricingModel)}
        >
          {(
            Object.entries(PRICING_MODEL_LABELS) as [DealPricingModel, string][]
          ).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>계약 상태</label>
        <select
          name="status"
          className={inputCls}
          defaultValue={deal?.status ?? "active"}
        >
          {(Object.entries(DEAL_STATUS_LABELS) as [DealStatus, string][]).map(
            ([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ),
          )}
        </select>
      </div>
      {showUnit ? (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>단가 (공급가액, 원) *</label>
            <MoneyInput name="unit_price" defaultValue={deal?.unit_price} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>수량 단위 라벨</label>
            <input
              name="unit_label"
              className={inputCls}
              defaultValue={deal?.unit_label ?? ""}
              placeholder="검수 통과 업로드 1건"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>수량 상한</label>
            <input
              name="quantity_cap"
              inputMode="numeric"
              className={inputCls}
              defaultValue={deal?.quantity_cap ?? ""}
            />
          </div>
        </>
      ) : null}
      {model === "min_guarantee_plus_unit" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>최소보장 수량</label>
            <input
              name="quantity_min"
              inputMode="numeric"
              className={inputCls}
              defaultValue={deal?.quantity_min ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>최소보장 정액 (원)</label>
            <MoneyInput
              name="min_guarantee_amount"
              defaultValue={deal?.min_guarantee_amount}
            />
          </div>
        </>
      ) : null}
      {model === "revenue_share" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>배분율 (%) *</label>
            <input
              name="revenue_share_pct"
              inputMode="decimal"
              className={inputCls}
              defaultValue={
                deal?.revenue_share_pct != null
                  ? String(Number(deal.revenue_share_pct))
                  : ""
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>산정 기준 서술</label>
            <input
              name="revenue_share_base"
              className={inputCls}
              defaultValue={deal?.revenue_share_base ?? ""}
            />
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>계약금액 (공급가액, 원)</label>
        <MoneyInput
          name="expected_supply_amount"
          defaultValue={deal?.expected_supply_amount}
        />
        {model === "composite" ? (
          <span className="text-[10px] leading-snug text-ink-4">
            최종 합의한 전체 공급가액을 입력하고, 저장 후 단가별 수량을 혼합
            매출로 나눠 등록하세요.
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>부가세 구분</label>
        <select
          name="vat_mode"
          className={inputCls}
          defaultValue={deal?.vat_mode ?? "vat_excluded"}
        >
          <option value="vat_excluded">부가세 별도</option>
          <option value="vat_included">부가세 포함</option>
          <option value="tax_free">면세</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>결제 조건</label>
        <input
          name="payment_terms"
          className={inputCls}
          defaultValue={deal?.payment_terms ?? ""}
          placeholder="세금계산서 발행일부터 30일 이내"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>계약 체결일</label>
        <input
          name="contract_signed_at"
          type="date"
          className={inputCls}
          defaultValue={deal?.contract_signed_at ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>계약서 링크</label>
        <input
          name="contract_doc_url"
          className={inputCls}
          defaultValue={deal?.contract_doc_url ?? ""}
          placeholder="https:// (계약서 파일·Drive)"
        />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>계약 근거 (메일·구두 확정 등)</label>
        <input
          name="agreement_basis"
          className={inputCls}
          defaultValue={deal?.agreement_basis ?? ""}
          placeholder="예: 8/14 계약서 메일 발송 + 유선 확정"
        />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>메모</label>
        <textarea
          name="memo"
          rows={2}
          className={inputCls}
          defaultValue={deal?.memo ?? ""}
        />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-2">{err}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {isEdit ? "계약 저장" : "계약 등록"}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          닫기
        </button>
      </div>
    </form>
  );
}

// ── 라인 등록/수정 폼 ───────────────────────────────────────────────────────

function LineForm({
  deal,
  line,
  onDone,
}: {
  deal: DealDto;
  line?: LineDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState<RevenueLineType>(
    line?.line_type ??
      (deal.pricing_model === "per_unit" ? "unit_billing" : "base"),
  );
  const isEdit = !!line;
  // 부가세 자동 입력(대표 지시 2026-08-27): 공급가액(또는 수량×단가) 입력 시 10%를
  // 즉시 채우고, 이후 직접 수정 가능. 면세 계약은 0원. 공급가액을 다시 바꾸면 재계산.
  const taxFree = deal.vat_mode === "tax_free";
  const [supplyStr, setSupplyStr] = useState(
    formatMoneyNumber(line?.supply_amount),
  );
  const [vatStr, setVatStr] = useState(formatMoneyNumber(line?.vat_amount));
  const [qtyStr, setQtyStr] = useState(
    line?.quantity != null ? String(line.quantity) : "",
  );
  const [unitStr, setUnitStr] = useState(
    formatMoneyNumber(line?.unit_price ?? deal.unit_price),
  );
  const autoVatFor = (supply: number) =>
    setVatStr(formatMoneyNumber(taxFree ? 0 : Math.round(supply * 0.1)));
  const recalcFromUnit = (qs: string, us: string) => {
    const q = Number(qs);
    if (!Number.isFinite(q) || q <= 0) return;
    autoVatFor(Math.round(q * moneyToNumber(us)));
  };
  const unitSupplyPreview = (() => {
    const q = Number(qtyStr);
    if (!Number.isFinite(q) || q <= 0) return null;
    const u = moneyToNumber(unitStr);
    return u > 0 ? Math.round(q * u) : null;
  })();
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      action={(fd) =>
        start(async () => {
          const res = isEdit
            ? await updateLineAction(fd)
            : await createLineAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      {isEdit ? (
        <input type="hidden" name="line_id" value={line.id} />
      ) : (
        <input type="hidden" name="deal_id" value={deal.id} />
      )}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>매출 구분</label>
        {isEdit ? (
          <p className="py-2 text-sm text-ink-2">{LINE_TYPE_LABELS[type]}</p>
        ) : (
          <select
            name="line_type"
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as RevenueLineType)}
          >
            {(
              Object.entries(LINE_TYPE_LABELS) as [RevenueLineType, string][]
            ).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>항목명 *</label>
        <input
          name="title"
          required
          className={inputCls}
          defaultValue={line?.title ?? ""}
          placeholder="예: 잔금 / 업로드 인원 정산 / 2차 활용료"
        />
      </div>
      {type === "unit_billing" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>수량 *</label>
            <input
              name="quantity"
              inputMode="decimal"
              required
              className={inputCls}
              value={qtyStr}
              onChange={(e) => {
                setQtyStr(e.target.value);
                recalcFromUnit(e.target.value, unitStr);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>단가 (원) *</label>
            <MoneyInput
              name="unit_price"
              value={unitStr}
              onValueChange={(v) => {
                setUnitStr(v);
                recalcFromUnit(qtyStr, v);
              }}
            />
          </div>
          <p className="self-end pb-2 text-xs text-ink-4">
            공급가액 = 수량 × 단가
            {unitSupplyPreview != null
              ? ` — 현재 ${formatWon(unitSupplyPreview)}`
              : " (자동 계산)"}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            공급가액 (원) *{type === "adjustment" ? " — 감액은 음수" : ""}
          </label>
          <MoneyInput
            name="supply_amount"
            value={supplyStr}
            onValueChange={(v) => {
              setSupplyStr(v);
              autoVatFor(moneyToNumber(v));
            }}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>부가세 (원)</label>
        <MoneyInput
          name="vat_amount"
          value={vatStr}
          onValueChange={setVatStr}
        />
        <span className="text-[10px] leading-snug text-ink-4">
          {taxFree
            ? "면세 계약 — 0원이 자동 입력됩니다."
            : "공급가액의 10%가 자동 입력됩니다. 필요하면 직접 수정하세요."}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>수금 예정일</label>
        <input
          name="due_date"
          type="date"
          className={inputCls}
          defaultValue={line?.due_date ?? ""}
        />
      </div>
      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>등록 상태</label>
          <select name="status" className={inputCls} defaultValue="confirmed">
            <option value="draft">미확정 (임시 저장)</option>
            <option value="confirmed">매출 확정</option>
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 sm:col-span-3">
        <label className={labelCls}>메모</label>
        <input
          name="memo"
          className={inputCls}
          defaultValue={line?.memo ?? ""}
        />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-3">{err}</p> : null}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {isEdit ? "매출 저장" : "매출 등록"}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          닫기
        </button>
      </div>
    </form>
  );
}

type MixedUnitLineDraft = {
  id: number;
  title: string;
  quantity: string;
  unitPrice: string;
  memo: string;
};

function MixedUnitLinesForm({
  deal,
  onDone,
}: {
  deal: DealDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<MixedUnitLineDraft[]>([
    { id: 1, title: "", quantity: "", unitPrice: "", memo: "" },
    { id: 2, title: "", quantity: "", unitPrice: "", memo: "" },
  ]);
  const taxFree = deal.vat_mode === "tax_free";

  const updateLine = (
    id: number,
    patch: Partial<Omit<MixedUnitLineDraft, "id">>,
  ) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const totals = lines.reduce(
    (sum, line) => {
      const quantity = Number(line.quantity);
      const unitPrice = moneyToNumber(line.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || unitPrice <= 0)
        return sum;
      const amount = calculateUnitPricing({ quantity, unitPrice, taxFree });
      return {
        supply: sum.supply + amount.supplyAmount,
        vat: sum.vat + amount.vatAmount,
        total: sum.total + amount.totalAmount,
      };
    },
    { supply: 0, vat: 0, total: 0 },
  );

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) =>
        start(async () => {
          fd.set(
            "lines_json",
            JSON.stringify(
              lines.map((line) => ({
                title: line.title.trim(),
                quantity: Number(line.quantity),
                unit_price: moneyToNumber(line.unitPrice),
                memo: line.memo.trim() || null,
              })),
            ),
          );
          const res = await createMixedUnitLinesAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="deal_id" value={deal.id} />
      <div className="rounded-lg bg-blue-500/5 px-3 py-2 text-xs text-ink-2">
        단가가 다른 항목을 한 번에 등록합니다. 공급가액과 부가세는 각 행의 수량
        × 단가로 서버에서 다시 계산합니다.
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => {
          const quantity = Number(line.quantity);
          const unitPrice = moneyToNumber(line.unitPrice);
          const amount =
            Number.isFinite(quantity) && quantity > 0 && unitPrice > 0
              ? calculateUnitPricing({ quantity, unitPrice, taxFree })
              : null;
          return (
            <div
              key={line.id}
              className="grid gap-2 rounded-lg border border-hairline-2 bg-background p-3 sm:grid-cols-12"
            >
              <div className="flex flex-col gap-1 sm:col-span-4">
                <label className={labelCls}>항목 {index + 1} *</label>
                <input
                  name={`mixed_title_${line.id}`}
                  required
                  className={inputCls}
                  value={line.title}
                  onChange={(e) =>
                    updateLine(line.id, { title: e.target.value })
                  }
                  placeholder="예: 일반 업로드"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className={labelCls}>수량 *</label>
                <input
                  name={`mixed_quantity_${line.id}`}
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  className={inputCls}
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(line.id, { quantity: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-3">
                <label className={labelCls}>단가 (원) *</label>
                <MoneyInput
                  name={`mixed_unit_price_${line.id}`}
                  value={line.unitPrice}
                  onValueChange={(value) =>
                    updateLine(line.id, { unitPrice: value })
                  }
                />
              </div>
              <div className="flex items-end justify-between gap-2 sm:col-span-3">
                <p className="pb-2 text-xs text-ink-3">
                  {amount ? formatWon(amount.supplyAmount) : "공급가액 0원"}
                </p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className={btnMini}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 sm:col-span-12">
                <label className={labelCls}>행 메모</label>
                <input
                  name={`mixed_memo_${line.id}`}
                  className={inputCls}
                  value={line.memo}
                  onChange={(e) =>
                    updateLine(line.id, { memo: e.target.value })
                  }
                  placeholder="합의 근거나 산정 기준"
                />
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={`${btnGhost} self-start`}
        onClick={() =>
          setLines((current) => [
            ...current,
            {
              id: Math.max(...current.map((line) => line.id), 0) + 1,
              title: "",
              quantity: "",
              unitPrice: "",
              memo: "",
            },
          ])
        }
      >
        + 단가 항목 추가
      </button>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>수금 예정일</label>
          <input name="due_date" type="date" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>등록 상태</label>
          <select name="status" className={inputCls} defaultValue="confirmed">
            <option value="draft">미확정 (임시 저장)</option>
            <option value="confirmed">매출 확정</option>
          </select>
        </div>
        <div className="rounded-lg bg-secondary/70 px-3 py-2 text-xs">
          <p>공급가액 {formatWon(totals.supply)}</p>
          <p>
            부가세 {formatWon(totals.vat)} · 합계 {formatWon(totals.total)}
          </p>
        </div>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "등록 중…" : `${lines.length}개 항목 일괄 등록`}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          닫기
        </button>
      </div>
    </form>
  );
}

function InvoiceConfirmedLinesForm({
  deal,
  today,
  onDone,
}: {
  deal: DealDto;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const confirmed = deal.lines.filter((line) => line.status === "confirmed");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    confirmed.map((line) => line.id),
  );
  const selectedLines = confirmed.filter((line) =>
    selectedIds.includes(line.id),
  );
  const supply = selectedLines.reduce(
    (sum, line) => sum + line.supply_amount,
    0,
  );
  const vat = selectedLines.reduce((sum, line) => sum + line.vat_amount, 0);
  const commonDueDates = new Set(
    selectedLines.map((line) => line.due_date).filter(Boolean),
  );
  const defaultDueDate =
    commonDueDates.size === 1
      ? ([...commonDueDates][0] as string)
      : addDaysYmd(today, 30);

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) =>
        start(async () => {
          fd.set("line_ids_json", JSON.stringify(selectedIds));
          const res = await recordTaxInvoiceAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="deal_id" value={deal.id} />
      <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
        <p>이 기능은 세금계산서를 외부에서 발행하지 않습니다.</p>
        <p>선택한 매출 항목들을 세금계산서 1건의 품목으로 묶어 기록합니다.</p>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-hairline-2 p-3 text-sm">
        {confirmed.map((line) => (
          <label
            key={line.id}
            className="flex items-start justify-between gap-3 py-1"
          >
            <span className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.includes(line.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, line.id]
                      : current.filter((id) => id !== line.id),
                  )
                }
                className="mt-0.5"
              />
              <span>{line.title}</span>
            </span>
            <span className="shrink-0">
              {formatWon(line.supply_amount + line.vat_amount)}
            </span>
          </label>
        ))}
        <div className="mt-1 flex justify-between border-t border-hairline-2 pt-2 font-semibold">
          <span>세금계산서 1건 · 품목 {selectedLines.length}개</span>
          <span>{formatWon(supply + vat)}</span>
        </div>
        <p className="text-xs text-ink-3">
          공급가액 {formatWon(supply)} + 부가세 {formatWon(vat)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>세금계산서 발행일 *</label>
          <input
            name="invoice_issued_at"
            type="date"
            required
            defaultValue={today}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>수금 예정일 *</label>
          <input
            name="due_date"
            type="date"
            required
            defaultValue={defaultDueDate}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>홈택스 승인번호·참조번호</label>
          <input
            name="external_reference"
            className={inputCls}
            placeholder="발행 후 확인 가능한 번호"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>계산서 메모</label>
          <input
            name="invoice_memo"
            className={inputCls}
            placeholder="예: LG 릴스 챌린지 최종 정산"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 rounded-lg border border-hairline-2 px-3 py-2 text-xs text-ink-2">
        <input
          name="actual_issuance_confirmed"
          value="yes"
          type="checkbox"
          required
          className="mt-0.5"
        />
        실제 세금계산서 발행이 완료됐으며 위 발행일과 수금 예정일이 맞습니다.
      </label>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || selectedLines.length === 0}
          className={btnPrimary}
        >
          {pending ? "처리 중…" : `세금계산서 1건으로 기록`}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          닫기
        </button>
      </div>
    </form>
  );
}

// ── 입금 기록 폼 ────────────────────────────────────────────────────────────

function ReceiptForm({
  deal,
  today,
  onDone,
}: {
  deal: DealDto;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const openLines = deal.lines.filter(
    (line) => line.status === "invoiced" || line.status === "received",
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      action={(fd) =>
        start(async () => {
          const res = await addReceiptAction(fd);
          if (!res.ok) return setErr(res.error);
          setErr(null);
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="deal_id" value={deal.id} />
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className={labelCls}>매출 항목 (미선택 시 가수금 처리)</label>
        <select
          name="line_id"
          className={inputCls}
          defaultValue={openLines.length === 1 ? openLines[0].id : ""}
        >
          <option value="">항목 미지정 (가수금)</option>
          {openLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} — {formatWon(l.supply_amount + l.vat_amount)} (
              {LINE_STATUS_LABELS[l.status]})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>수금액 (원, 환불·회수는 음수) *</label>
        <MoneyInput name="amount" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>수금일 *</label>
        <input
          name="received_on"
          type="date"
          required
          defaultValue={today}
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Clobe 거래 ID</label>
        <input
          name="clobe_tx_id"
          className={inputCls}
          placeholder="140277395"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>메모</label>
        <input name="memo" className={inputCls} />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-3">{err}</p> : null}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          수금 등록
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          닫기
        </button>
      </div>
    </form>
  );
}

// ── 라인 행 (상태 전환 버튼 포함) ────────────────────────────────────────────

function LineRow({ deal, line }: { deal: DealDto; line: LineDto }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const transition = (next: RevenueLineStatus) =>
    start(async () => {
      const fd = new FormData();
      fd.set("line_id", line.id);
      fd.set("next_status", next);
      const res = await setLineStatusAction(fd);
      if (!res.ok) return setErr(res.error);
      setErr(null);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!window.confirm("이 매출 항목을 삭제할까요?")) return;
      const fd = new FormData();
      fd.set("line_id", line.id);
      const res = await deleteLineAction(fd);
      if (!res.ok) return setErr(res.error);
      setErr(null);
      router.refresh();
    });

  const total = line.supply_amount + line.vat_amount;
  const remaining = total - line.receipts_sum;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-ink-3">
              {LINE_TYPE_LABELS[line.line_type]}
            </span>
            <span className="truncate text-sm font-medium">{line.title}</span>
            <LineStatusBadge line={line} />
          </div>
          <p className="text-xs text-ink-3">
            공급가액 {formatWon(line.supply_amount)} + 부가세{" "}
            {formatWon(line.vat_amount)} = 합계 {formatWon(total)}
            {line.quantity != null && line.unit_price != null
              ? ` (${line.quantity} × ${formatWon(line.unit_price)})`
              : ""}
          </p>
          <p className="text-xs text-ink-4">
            {line.invoice_issued_at
              ? `세금계산서 발행 ${line.invoice_issued_at} · `
              : ""}
            {line.due_date ? `수금 예정 ${line.due_date} · ` : ""}
            {line.status === "received"
              ? `수금 완료 ${line.received_at}`
              : line.receipts_sum > 0
                ? `수금 ${formatWon(line.receipts_sum)} / 미수 ${formatWon(remaining)}`
                : "수금 전"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {line.status === "draft" ? (
            <>
              <button
                className={btnMini}
                disabled={pending}
                onClick={() => transition("confirmed")}
              >
                매출 확정
              </button>
              <button
                className={btnMini}
                disabled={pending}
                onClick={() => setEditing((v) => !v)}
              >
                수정
              </button>
              <button className={btnMini} disabled={pending} onClick={remove}>
                삭제
              </button>
            </>
          ) : null}
          {line.status === "confirmed" ? (
            <>
              <button
                className={btnMini}
                disabled={pending}
                onClick={() => setEditing((v) => !v)}
              >
                수정
              </button>
              <button
                className={btnMini}
                disabled={pending}
                onClick={() => transition("draft")}
              >
                확정 취소
              </button>
            </>
          ) : null}
          {line.status !== "received" && line.status !== "cancelled" ? (
            <button
              className={btnMini}
              disabled={pending}
              onClick={() => transition("cancelled")}
            >
              취소
            </button>
          ) : null}
          {line.status === "cancelled" ? (
            <button className={btnMini} disabled={pending} onClick={remove}>
              삭제
            </button>
          ) : null}
        </div>
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {editing ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <LineForm deal={deal} line={line} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}

function TaxInvoiceCard({
  invoice,
  lines,
}: {
  invoice: TaxInvoiceDto;
  lines: LineDto[];
}) {
  const total = invoice.supply_amount + invoice.vat_amount;

  return (
    <section className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
              세금계산서 1건
            </span>
            <span className="text-sm font-semibold">
              발행일 {invoice.issued_on}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            공급가액 {formatWon(invoice.supply_amount)} + 부가세{" "}
            {formatWon(invoice.vat_amount)} = 합계 {formatWon(total)}
          </p>
          <p className="text-xs text-ink-4">
            품목 {lines.length}개
            {invoice.due_date ? ` · 수금 예정 ${invoice.due_date}` : ""}
            {invoice.external_reference
              ? ` · 참조번호 ${invoice.external_reference}`
              : ""}
          </p>
          {invoice.memo ? (
            <p className="text-xs text-ink-4">메모: {invoice.memo}</p>
          ) : null}
        </div>
        {invoice.document_url ? (
          <a
            href={invoice.document_url}
            target="_blank"
            rel="noreferrer"
            className={btnMini}
          >
            계산서 문서
          </a>
        ) : null}
      </header>
      <div className="mt-3 flex flex-col gap-1.5 border-t border-blue-500/15 pt-2">
        {lines.map((line) => {
          const lineTotal = line.supply_amount + line.vat_amount;
          const remaining = lineTotal - line.receipts_sum;
          return (
            <div
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card/70 px-2.5 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{line.title}</span>
                  <LineStatusBadge line={line} />
                </div>
                <p className="text-ink-4">
                  공급가액 {formatWon(line.supply_amount)} · 부가세{" "}
                  {formatWon(line.vat_amount)}
                  {line.quantity != null && line.unit_price != null
                    ? ` · ${line.quantity} × ${formatWon(line.unit_price)}`
                    : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{formatWon(lineTotal)}</p>
                <p className="text-ink-4">
                  {line.status === "received"
                    ? `수금 완료 ${line.received_at ?? ""}`
                    : line.receipts_sum > 0
                      ? `미수 ${formatWon(remaining)}`
                      : "수금 전"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── 딜 카드 ────────────────────────────────────────────────────────────────

function DealCard({
  deal,
  parties,
  projects,
  today,
}: {
  deal: DealDto;
  parties: PartyDto[];
  projects: ProjectOption[];
  today: string;
}) {
  const [panel, setPanel] = useState<
    "none" | "line" | "mixed" | "invoice" | "receipt" | "edit"
  >("none");
  const terms = dealTermsSummary(deal);
  const confirmedLines = deal.lines.filter(
    (line) => line.status === "confirmed",
  );
  const groupedLineIds = new Set(
    deal.lines
      .filter((line) => line.tax_invoice_id != null)
      .map((line) => line.id),
  );
  const ungroupedLines = deal.lines.filter(
    (line) => !groupedLineIds.has(line.id),
  );
  const expectedGap =
    deal.expected_supply_amount == null
      ? null
      : deal.expected_supply_amount - deal.billed_supply;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-hairline-2 bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{deal.client_name}</h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-ink-2">
              {DEAL_STATUS_LABELS[deal.status]}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-ink-3">
              {PRICING_MODEL_LABELS[deal.pricing_model]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-2">
            {deal.project_short_code ? (
              <Link
                href={`/projects/${deal.project_short_code}`}
                className="hover:underline"
              >
                [{deal.project_short_code}] {deal.project_title}
              </Link>
            ) : (
              deal.project_title
            )}
          </p>
          <p className="text-xs text-ink-3">
            {terms}
            {deal.vat_mode === "vat_excluded"
              ? " · 부가세 별도"
              : deal.vat_mode === "tax_free"
                ? " · 면세"
                : " · 부가세 포함"}
            {deal.payment_terms ? ` · ${deal.payment_terms}` : ""}
          </p>
          {deal.agreement_basis ? (
            <p className="text-xs text-ink-4">근거: {deal.agreement_basis}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {deal.pricing_model === "composite" ? (
            <button
              className={btnMini}
              onClick={() => setPanel(panel === "mixed" ? "none" : "mixed")}
            >
              + 혼합 매출
            </button>
          ) : null}
          <button
            className={btnMini}
            onClick={() => setPanel(panel === "line" ? "none" : "line")}
          >
            {deal.pricing_model === "composite" ? "+ 기타 매출" : "+ 매출 등록"}
          </button>
          {confirmedLines.length > 0 ? (
            <button
              className={btnMini}
              onClick={() => setPanel(panel === "invoice" ? "none" : "invoice")}
            >
              세금계산서 1건 기록
            </button>
          ) : null}
          <button
            className={btnMini}
            onClick={() => setPanel(panel === "receipt" ? "none" : "receipt")}
          >
            + 수금 등록
          </button>
          <button
            className={btnMini}
            onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
          >
            계약 수정
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">매출액 (공급가액)</p>
          <p className="text-sm font-semibold">
            {formatWon(deal.billed_supply)}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">합계금액 (부가세 포함)</p>
          <p className="text-sm font-semibold">
            {formatWon(deal.billed_total)}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">수금액</p>
          <p className="text-sm font-semibold">
            {formatWon(deal.receipts_sum)}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">미수금</p>
          <p
            className={`text-sm font-semibold ${deal.outstanding > 0 ? "text-red-600" : ""}`}
          >
            {formatWon(deal.outstanding)}
            {deal.overdue_count > 0 ? ` · 연체 ${deal.overdue_count}건` : ""}
          </p>
        </div>
      </div>

      {expectedGap != null ? (
        expectedGap === 0 ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700">
            계약금액과 매출 확정 공급가액이 {formatWon(deal.billed_supply)}으로
            일치합니다.
          </p>
        ) : (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
            계약금액 {formatWon(deal.expected_supply_amount!)} 대비 매출 확정
            공급가액이{" "}
            {expectedGap > 0
              ? `${formatWon(expectedGap)} 부족합니다.`
              : `${formatWon(Math.abs(expectedGap))} 초과합니다.`}
          </p>
        )
      ) : null}

      {deal.hints ? (
        <p className="rounded-lg bg-blue-500/5 px-3 py-2 text-xs text-ink-2">
          정산 수량 참고(운영 데이터 — 확정 수량은 직접 입력): 유효 댄서 정산행{" "}
          <b>{deal.hints.dancerRows}</b> · 영상 제출자{" "}
          <b>{deal.hints.submissions}</b> · 현장 체크인{" "}
          <b>{deal.hints.checkedIn}</b>
          {deal.quantity_cap != null ? ` · 계약 상한 ${deal.quantity_cap}` : ""}
        </p>
      ) : null}

      {deal.unallocated_receipts !== 0 ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
          가수금 {formatWon(deal.unallocated_receipts)} (매출 항목 미배정) —
          어느 매출의 수금인지 지정해 주세요.
        </p>
      ) : null}

      {panel === "edit" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <DealForm
            parties={parties}
            projects={projects}
            deal={deal}
            onDone={() => setPanel("none")}
          />
        </div>
      ) : null}
      {panel === "line" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <LineForm deal={deal} onDone={() => setPanel("none")} />
        </div>
      ) : null}
      {panel === "mixed" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <MixedUnitLinesForm deal={deal} onDone={() => setPanel("none")} />
        </div>
      ) : null}
      {panel === "invoice" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <InvoiceConfirmedLinesForm
            deal={deal}
            today={today}
            onDone={() => setPanel("none")}
          />
        </div>
      ) : null}
      {panel === "receipt" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <ReceiptForm
            deal={deal}
            today={today}
            onDone={() => setPanel("none")}
          />
        </div>
      ) : null}

      {deal.lines.length > 0 ? (
        <div className="flex flex-col gap-3">
          {deal.tax_invoices.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-ink-3">
                발행 세금계산서 {deal.tax_invoices.length}건
              </p>
              {deal.tax_invoices.map((invoice) => (
                <TaxInvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  lines={deal.lines.filter(
                    (line) => line.tax_invoice_id === invoice.id,
                  )}
                />
              ))}
            </div>
          ) : null}
          {ungroupedLines.length > 0 ? (
            <div className="flex flex-col gap-2">
              {deal.tax_invoices.length > 0 ? (
                <p className="text-xs font-semibold text-ink-3">
                  계산서 미발행 매출 항목 {ungroupedLines.length}개
                </p>
              ) : null}
              {ungroupedLines.map((line) => (
                <LineRow key={line.id} deal={deal} line={line} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-4">
          등록된 매출이 아직 없습니다. 금액이 확정되면 &lsquo;매출
          등록&rsquo;으로 추가해 주세요.
        </p>
      )}

      {deal.receipts.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-3">
            수금 내역 {deal.receipts.length}건 · 합계{" "}
            {formatWon(deal.receipts_sum)}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {deal.receipts.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 px-3 py-1.5 text-xs"
              >
                <span className="font-medium">{formatWon(r.amount)}</span>
                <span className="text-ink-3">{r.received_on}</span>
                {r.line_id == null ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
                    가수금
                  </span>
                ) : null}
                {r.clobe_tx_id ? (
                  <span className="text-ink-4">Clobe {r.clobe_tx_id}</span>
                ) : null}
                {r.memo ? <span className="text-ink-4">{r.memo}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

// ── 메인 콘솔 ──────────────────────────────────────────────────────────────

export function ReceivablesConsole({
  deals,
  parties,
  projects,
  today,
}: {
  deals: DealDto[];
  parties: PartyDto[];
  projects: ProjectOption[];
  today: string;
}) {
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showNewParty, setShowNewParty] = useState(false);

  const summary = useMemo(() => {
    const active = deals.filter((d) => d.status !== "cancelled");
    return {
      billedSupply: active.reduce((t, d) => t + d.billed_supply, 0),
      received: active.reduce((t, d) => t + d.receipts_sum, 0),
      outstanding: active.reduce((t, d) => t + d.outstanding, 0),
      overdue: active.reduce((t, d) => t + d.overdue_count, 0),
    };
  }, [deals]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-16 pt-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">
          매출·수금 관리 (받을 돈)
        </h1>
        <p className="text-sm text-ink-3">
          프로젝트별 계약(수주)·매출·세금계산서·수금을 기록합니다. 경영지원실
          전용 — 금액 정본은 이 화면입니다.
        </p>
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-ink-2">
          처리 순서: <b>① 계약 등록</b> → <b>② 매출 확정</b> →{" "}
          <b>③ 세금계산서 발행</b> → <b>④ 수금 등록</b> — 미수금·연체는 자동
          계산됩니다.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">매출 합계 (공급가액)</p>
          <p className="text-base font-bold">
            {formatWon(summary.billedSupply)}
          </p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">수금 합계</p>
          <p className="text-base font-bold">{formatWon(summary.received)}</p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">미수금 (부가세 포함)</p>
          <p
            className={`text-base font-bold ${summary.outstanding > 0 ? "text-red-600" : ""}`}
          >
            {formatWon(summary.outstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">연체</p>
          <p
            className={`text-base font-bold ${summary.overdue > 0 ? "text-red-600" : ""}`}
          >
            {summary.overdue}건
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          onClick={() => {
            setShowNewDeal((v) => !v);
            setShowNewParty(false);
          }}
        >
          {showNewDeal ? "등록 닫기" : "계약 등록"}
        </button>
        <button
          className={btnGhost}
          onClick={() => {
            setShowNewParty((v) => !v);
            setShowNewDeal(false);
          }}
        >
          {showNewParty ? "거래처 닫기" : "거래처 등록"}
        </button>
      </div>

      {showNewParty ? (
        <div className="rounded-xl border border-hairline-2 bg-card p-4">
          <NewPartyForm onDone={() => setShowNewParty(false)} />
        </div>
      ) : null}
      {showNewDeal ? (
        <div className="rounded-xl border border-hairline-2 bg-card p-4">
          <DealForm
            parties={parties}
            projects={projects}
            onDone={() => setShowNewDeal(false)}
          />
        </div>
      ) : null}

      {deals.length === 0 ? (
        <p className="text-sm text-ink-4">
          등록된 계약이 없습니다. &lsquo;계약 등록&rsquo;으로 시작해 주세요.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {deals.map((d) => (
            <DealCard
              key={d.id}
              deal={d}
              parties={parties}
              projects={projects}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  );
}

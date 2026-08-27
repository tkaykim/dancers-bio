"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClientPartyAction,
  createDealAction,
  updateDealAction,
  createLineAction,
  updateLineAction,
  setLineStatusAction,
  deleteLineAction,
  addReceiptAction,
} from "@/app/actions/receivables";
import {
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
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [v, setV] = useState(
    props.defaultValue != null
      ? Math.round(props.defaultValue).toLocaleString("ko-KR")
      : "",
  );
  return (
    <input
      name={props.name}
      value={v}
      required={props.required}
      onChange={(e) => setV(formatMoneyText(e.target.value))}
      inputMode="numeric"
      placeholder={props.placeholder ?? "0"}
      className={
        props.className ??
        "w-full rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm"
      }
    />
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
        <label className={labelCls}>정식 상호 *</label>
        <input name="name" required className={inputCls} placeholder="주식회사 ○○" />
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
          <select name="project_id" required className={inputCls} defaultValue="">
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
        <label className={labelCls}>거래처 표시명 {partyId ? "(마스터 사용)" : "*"}</label>
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
        <label className={labelCls}>딜 담당 창구</label>
        <input
          name="contact_name"
          className={inputCls}
          defaultValue={deal?.contact_name ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>창구 이메일</label>
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
        <label className={labelCls}>딜 상태</label>
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
            <label className={labelCls}>단가 (공급가, 원) *</label>
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
        <label className={labelCls}>예상 총액 (공급가, 원)</label>
        <MoneyInput
          name="expected_supply_amount"
          defaultValue={deal?.expected_supply_amount}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>부가세 구분</label>
        <select
          name="vat_mode"
          className={inputCls}
          defaultValue={deal?.vat_mode ?? "vat_excluded"}
        >
          <option value="vat_excluded">VAT 별도</option>
          <option value="vat_included">VAT 포함가 합의</option>
          <option value="tax_free">면세</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>지급 조건</label>
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
        <label className={labelCls}>합의 근거 (서면 추적)</label>
        <input
          name="agreement_basis"
          className={inputCls}
          defaultValue={deal?.agreement_basis ?? ""}
          placeholder="메일 mailId·계약서·유선 일자 등"
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
          {isEdit ? "딜 저장" : "딜 등록"}
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
    line?.line_type ?? (deal.pricing_model === "per_unit" ? "unit_billing" : "base"),
  );
  const isEdit = !!line;
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
        <label className={labelCls}>라인 유형</label>
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
          placeholder="예: 잔금 / 업로드 61건 정산 / 2차 활용료"
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
              defaultValue={line?.quantity ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>단가 (원) *</label>
            <MoneyInput
              name="unit_price"
              defaultValue={line?.unit_price ?? deal.unit_price}
            />
          </div>
          <p className="self-end pb-2 text-xs text-ink-4">
            공급가 = 수량 × 단가 (서버 계산)
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            공급가 (원) *{type === "adjustment" ? " — 감액은 음수" : ""}
          </label>
          <MoneyInput name="supply_amount" defaultValue={line?.supply_amount} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>부가세 (원, 비우면 10%)</label>
        <MoneyInput name="vat_amount" defaultValue={line?.vat_amount} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>지급예정일</label>
        <input
          name="due_date"
          type="date"
          className={inputCls}
          defaultValue={line?.due_date ?? ""}
        />
      </div>
      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>초기 상태</label>
          <select name="status" className={inputCls} defaultValue="confirmed">
            <option value="draft">초안(금액 미확정)</option>
            <option value="confirmed">확정(청구 가능)</option>
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 sm:col-span-3">
        <label className={labelCls}>메모</label>
        <input name="memo" className={inputCls} defaultValue={line?.memo ?? ""} />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-3">{err}</p> : null}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {isEdit ? "라인 저장" : "라인 추가"}
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
    (l) => l.status === "confirmed" || l.status === "invoiced",
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
        <label className={labelCls}>청구 라인 (미선택 = 미배부 입금)</label>
        <select
          name="line_id"
          className={inputCls}
          defaultValue={openLines.length === 1 ? openLines[0].id : ""}
        >
          <option value="">라인 미지정</option>
          {deal.lines
            .filter((l) => l.status !== "cancelled")
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} — {formatWon(l.supply_amount + l.vat_amount)} (
                {LINE_STATUS_LABELS[l.status]})
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>입금액 (원, 환불은 음수) *</label>
        <MoneyInput name="amount" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>입금일 *</label>
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
        <input name="clobe_tx_id" className={inputCls} placeholder="140277395" />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>메모</label>
        <input name="memo" className={inputCls} />
      </div>
      {err ? <p className="text-sm text-red-600 sm:col-span-3">{err}</p> : null}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          입금 기록
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
      if (!window.confirm("이 라인을 삭제할까요?")) return;
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
            공급가 {formatWon(line.supply_amount)} + VAT{" "}
            {formatWon(line.vat_amount)} = {formatWon(total)}
            {line.quantity != null && line.unit_price != null
              ? ` (${line.quantity} × ${formatWon(line.unit_price)})`
              : ""}
          </p>
          <p className="text-xs text-ink-4">
            {line.invoice_issued_at
              ? `계산서 ${line.invoice_issued_at} · `
              : ""}
            {line.due_date ? `지급예정 ${line.due_date} · ` : ""}
            {line.status === "received"
              ? `수납 ${line.received_at}`
              : line.receipts_sum > 0
                ? `입금 ${formatWon(line.receipts_sum)} / 잔액 ${formatWon(remaining)}`
                : "입금 전"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {line.status === "draft" ? (
            <>
              <button className={btnMini} disabled={pending} onClick={() => transition("confirmed")}>
                확정
              </button>
              <button className={btnMini} disabled={pending} onClick={() => setEditing((v) => !v)}>
                수정
              </button>
              <button className={btnMini} disabled={pending} onClick={remove}>
                삭제
              </button>
            </>
          ) : null}
          {line.status === "confirmed" ? (
            <>
              <button className={btnMini} disabled={pending} onClick={() => transition("invoiced")}>
                계산서 발행
              </button>
              <button className={btnMini} disabled={pending} onClick={() => setEditing((v) => !v)}>
                수정
              </button>
              <button className={btnMini} disabled={pending} onClick={() => transition("draft")}>
                초안으로
              </button>
            </>
          ) : null}
          {line.status !== "received" && line.status !== "cancelled" ? (
            <button className={btnMini} disabled={pending} onClick={() => transition("cancelled")}>
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
  const [panel, setPanel] = useState<"none" | "line" | "receipt" | "edit">(
    "none",
  );
  const terms = dealTermsSummary(deal);
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
              ? " · VAT 별도"
              : deal.vat_mode === "tax_free"
                ? " · 면세"
                : " · VAT 포함 합의"}
            {deal.payment_terms ? ` · ${deal.payment_terms}` : ""}
          </p>
          {deal.agreement_basis ? (
            <p className="text-xs text-ink-4">근거: {deal.agreement_basis}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <button className={btnMini} onClick={() => setPanel(panel === "line" ? "none" : "line")}>
            + 청구 라인
          </button>
          <button className={btnMini} onClick={() => setPanel(panel === "receipt" ? "none" : "receipt")}>
            + 입금 기록
          </button>
          <button className={btnMini} onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>
            딜 수정
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">청구 확정 (공급가)</p>
          <p className="text-sm font-semibold">{formatWon(deal.billed_supply)}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">청구 총액 (VAT 포함)</p>
          <p className="text-sm font-semibold">{formatWon(deal.billed_total)}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">입금 합계</p>
          <p className="text-sm font-semibold">{formatWon(deal.receipts_sum)}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <p className="text-[11px] text-ink-3">미수 잔액</p>
          <p
            className={`text-sm font-semibold ${deal.outstanding > 0 ? "text-red-600" : ""}`}
          >
            {formatWon(deal.outstanding)}
            {deal.overdue_count > 0 ? ` · 연체 ${deal.overdue_count}건` : ""}
          </p>
        </div>
      </div>

      {deal.hints ? (
        <p className="rounded-lg bg-blue-500/5 px-3 py-2 text-xs text-ink-2">
          수량 힌트(제안값 — 확정은 수동, 설계 §5): 유효 댄서 정산행{" "}
          <b>{deal.hints.dancerRows}</b> · 영상 제출자{" "}
          <b>{deal.hints.submissions}</b> · 현장 체크인{" "}
          <b>{deal.hints.checkedIn}</b>
          {deal.quantity_cap != null ? ` · 계약 상한 ${deal.quantity_cap}` : ""}
        </p>
      ) : null}

      {deal.unallocated_receipts !== 0 ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
          라인 미배부 입금 {formatWon(deal.unallocated_receipts)} — 청구 라인에
          배부해 주세요.
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
      {panel === "receipt" ? (
        <div className="rounded-lg bg-secondary/50 p-3">
          <ReceiptForm deal={deal} today={today} onDone={() => setPanel("none")} />
        </div>
      ) : null}

      {deal.lines.length > 0 ? (
        <div className="flex flex-col gap-2">
          {deal.lines.map((l) => (
            <LineRow key={l.id} deal={deal} line={l} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-4">
          청구 라인이 아직 없습니다. 금액이 확정되면 라인을 추가해 주세요.
        </p>
      )}

      {deal.receipts.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-3">
            입금 기록 {deal.receipts.length}건 · 합계{" "}
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
                    미배부
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
      outstanding: active.reduce((t, d) => t + d.outstanding, 0),
      overdue: active.reduce((t, d) => t + d.overdue_count, 0),
      negotiating: deals.filter((d) => d.status === "negotiating").length,
    };
  }, [deals]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-16 pt-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">받을 돈 (매출채권)</h1>
        <p className="text-sm text-ink-3">
          프로젝트별 거래처·계약 조건·청구·입금을 기록합니다. 경영지원실 전용 —
          금액 정본은 이 화면입니다.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">확정 채권 (공급가)</p>
          <p className="text-base font-bold">{formatWon(summary.billedSupply)}</p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">미수 잔액 (VAT 포함)</p>
          <p
            className={`text-base font-bold ${summary.outstanding > 0 ? "text-red-600" : ""}`}
          >
            {formatWon(summary.outstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">연체 라인</p>
          <p className="text-base font-bold">{summary.overdue}건</p>
        </div>
        <div className="rounded-xl border border-hairline-2 p-3">
          <p className="text-[11px] text-ink-3">협의중 딜</p>
          <p className="text-base font-bold">{summary.negotiating}건</p>
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
          {showNewDeal ? "새 딜 닫기" : "새 딜 등록"}
        </button>
        <button
          className={btnGhost}
          onClick={() => {
            setShowNewParty((v) => !v);
            setShowNewDeal(false);
          }}
        >
          {showNewParty ? "거래처 닫기" : "새 거래처"}
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
        <p className="text-sm text-ink-4">등록된 딜이 없습니다.</p>
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

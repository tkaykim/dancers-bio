"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approvePaymentOperationAction,
  reconcilePaymentOperationAction,
  rejectPaymentOperationAction,
  requestPaymentOperationAction,
} from "@/app/actions/payment-operations";
import type { AdminPaymentOperation, AdminPaymentRow } from "@/lib/admin/payments";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  unpaid: "미결제",
  link_sent: "링크 발송",
  pending: "결제 대기",
  active: "분할 결제 중",
  paid: "결제 완료",
  completed: "결제 완료",
  refunded: "전액 환불",
  partially_refunded: "부분환불",
  cancelled: "취소",
  failed: "결제 실패",
  abandoned: "결제창 이탈",
  confirmed: "참가 확정",
  transferred: "양도 처리",
  recovery_required: "확인 필요",
};

const OPERATION_STATUS_LABEL: Record<string, string> = {
  requested: "승인 대기",
  processing: "처리 중",
  provider_pending: "PG 완료 대기",
  completed: "완료",
  failed: "실패",
  rejected: "거절",
  reconciliation_required: "대사 필요",
  cancelled: "요청 취소",
};

const SOURCE_LABEL: Record<string, string> = {
  all: "전체 원장",
  grigoent: "grigoent",
  visa_mirror: "비자 미러",
  workshop: "워크샵 예약",
  workshop_event: "워크샵 행사",
};

const STATUS_OPTIONS = [
  ["all", "전체 상태"],
  ["paid_or_completed", "결제 완료"],
  ["partially_refunded", "부분환불"],
  ["refunded", "전액 환불"],
  ["pending", "결제 대기"],
  ["active", "분할 결제 중"],
  ["failed", "결제 실패"],
  ["abandoned", "결제창 이탈"],
  ["cancelled", "취소"],
  ["recovery_required", "확인 필요"],
] as const;

const REASON_OPTIONS = [
  ["customer_request", "고객 요청"],
  ["duplicate", "중복 결제"],
  ["schedule_change", "일정 변경·취소"],
  ["service_issue", "서비스 제공 문제"],
  ["other", "기타"],
] as const;

const ACTIVE_OPERATION_STATUSES = new Set(["requested", "processing", "provider_pending", "reconciliation_required"]);

function formatMoney(currency: string, amount: number | null): string {
  if (amount === null) return "-";
  const digits = ["KRW", "JPY"].includes(currency) ? 0 : 2;
  const value = amount.toLocaleString(currency === "KRW" ? "ko-KR" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (currency === "KRW") return `₩${value}`;
  if (currency === "THB") return `฿${value}`;
  if (currency === "USD") return `$${value}`;
  return `${currency} ${value}`;
}

function formatDate(value: string | null, compact = false): string {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(compact ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const date = compact
    ? `${part("year").slice(-2)}. ${part("month")}. ${part("day")}.`
    : `${part("year")}. ${part("month")}. ${part("day")}.`;
  return compact ? date : `${date} ${part("hour")}:${part("minute")}`;
}

function statusClass(status: string): string {
  if (["completed", "paid", "confirmed", "transferred"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["failed", "recovery_required", "reconciliation_required"].includes(status)) return "bg-red-50 text-red-700";
  if (["pending", "link_sent", "active", "requested", "processing", "provider_pending"].includes(status)) return "bg-amber-50 text-amber-700";
  if (["refunded", "partially_refunded"].includes(status)) return "bg-blue-50 text-blue-700";
  return "bg-secondary text-ink-3";
}

function displayStatus(item: AdminPaymentRow): string {
  if (item.refundState === "partial") return "partially_refunded";
  if (item.refundState === "full") return "refunded";
  return item.status;
}

export function PaymentsAdminTable({
  items,
  warnings,
  grigoentConfigured,
  executionConfigured,
  generatedAt,
  currentUserId,
  canExecuteDirectly = false,
  preview = false,
}: {
  items: AdminPaymentRow[];
  warnings: string[];
  grigoentConfigured: boolean;
  executionConfigured: boolean;
  generatedAt: string;
  currentUserId: string;
  canExecuteDirectly?: boolean;
  preview?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const products = useMemo(
    () => Array.from(new Map(items.map((item) => [item.productSlug ?? item.productLabel, item.productLabel])).entries()).sort((a, b) => a[1].localeCompare(b[1], "ko")),
    [items],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const shownStatus = displayStatus(item);
      if (source !== "all" && item.source !== source) return false;
      if (status === "paid_or_completed" && !["paid", "completed", "confirmed", "transferred"].includes(shownStatus)) return false;
      if (status === "partially_refunded" && item.refundState !== "partial") return false;
      if (status !== "all" && status !== "paid_or_completed" && status !== "partially_refunded" && shownStatus !== status) return false;
      if (product !== "all" && (item.productSlug ?? item.productLabel) !== product) return false;
      if (attentionOnly && !item.needsAttention) return false;
      if (!normalized) return true;
      return [
        item.orderNo,
        item.customerName,
        item.customerEmail,
        item.customerPhone,
        item.productLabel,
        item.planLabel,
        item.attentionReason,
        item.auditFingerprint,
        item.auditUserAgent,
        item.auditReferrer,
        ...item.paymentLines.map((line) => line.id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [attentionOnly, items, product, query, source, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const completed = items.filter((item) => ["paid", "completed", "confirmed", "transferred"].includes(item.status));
  const pendingApprovals = items.flatMap((item) => item.operations).filter((operation) => operation.status === "requested").length;
  const attention = items.filter((item) => item.needsAttention).length;
  const refunded = items.reduce((sum, item) => sum + (item.currency === "KRW" ? item.refundedAmount : 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <Summary label="전체" value={`${items.length}건`} />
        <Summary label="결제 완료" value={`${completed.length}건`} />
        <Summary label="승인 대기" value={`${pendingApprovals}건`} accent={pendingApprovals > 0} />
        <Summary label="확인 필요" value={`${attention}건`} danger={attention > 0} />
        <Summary label="누적 환불(KRW)" value={formatMoney("KRW", refunded)} />
      </section>

      {!grigoentConfigured ? <Warning>grigoent 연결 설정이 없어 deetz 내부 결제만 표시됩니다.</Warning> : null}
      {!executionConfigured && grigoentConfigured ? <Warning>grigoent 환불 명령용 공유 시크릿이 없어 요청 조회만 가능하며 승인 실행은 차단됩니다.</Warning> : null}
      {canExecuteDirectly && !preview ? (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          이 계정은 취소·환불을 다른 관리자 승인 없이 즉시 실행할 수 있습니다.
        </div>
      ) : null}
      {preview ? <Warning>QA 미리보기 데이터이며 요청·승인·환불은 실제 서버나 PG로 전송되지 않습니다.</Warning> : null}
      {warnings.map((warning) => <Warning key={warning}>{warning}</Warning>)}

      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="주문번호, 고객명, 이메일, 전화번호, 결제 ID 검색"
              className="h-9 w-full rounded-lg border border-hairline-2 bg-background pl-9 pr-3 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <FilterSelect value={source} onChange={(value) => { setSource(value); setPage(1); }} options={Object.entries(SOURCE_LABEL)} />
          <FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={STATUS_OPTIONS as unknown as string[][]} />
          <select value={product} onChange={(event) => { setProduct(event.target.value); setPage(1); }} className="h-9 rounded-lg border border-hairline-2 bg-background px-3 text-xs">
            <option value="all">전체 상품</option>
            {products.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { setAttentionOnly((value) => !value); setPage(1); }}
            className={cn("h-9 rounded-lg border px-3 text-xs font-medium", attentionOnly ? "border-red-300 bg-red-50 text-red-700" : "border-hairline-2 text-ink-2")}
          >
            확인 필요만
          </button>
          <button type="button" onClick={() => router.refresh()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-hairline-2 px-3 text-xs text-ink-2 hover:text-foreground">
            <RefreshCw className="size-3.5" /> 새로고침
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-4">
          <span>{filtered.length}건 표시 · 전체 {items.length}건</span>
          <span>마지막 조회 {formatDate(generatedAt)}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] table-fixed text-left">
            <thead className="sticky top-0 z-10 bg-secondary/95 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-4 backdrop-blur">
              <tr>
                <th className="w-[92px] px-3 py-2.5">주문일</th>
                <th className="w-[29%] px-3 py-2.5">상품 · 고객</th>
                <th className="w-[18%] px-3 py-2.5">주문번호</th>
                <th className="w-[120px] px-3 py-2.5">원장 · PG</th>
                <th className="w-[118px] px-3 py-2.5">상태</th>
                <th className="px-3 py-2.5 text-right">순결제 · 환불</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map((item) => (
                <tr
                  key={item.id}
                  tabIndex={0}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(item.id); }}
                  className={cn("h-[58px] cursor-pointer transition-colors hover:bg-secondary/55 focus:bg-secondary/55 focus:outline-none", item.needsAttention && "bg-red-50/35")}
                >
                  <td className="px-3 py-2 text-[11px] text-ink-3">{formatDate(item.createdAt, true)}</td>
                  <td className="px-3 py-2">
                    <p className="truncate text-xs font-semibold text-foreground" title={item.productLabel}>{item.productLabel}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-3">{item.customerName} · {item.customerEmail}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="truncate font-mono text-[11px] text-foreground">{item.orderNo ?? "주문번호 없음"}</p>
                    <p className="mt-0.5 text-[10px] text-ink-4">결제 {item.paymentCount}건{item.failedPaymentCount ? ` · 실패 ${item.failedPaymentCount}` : ""}</p>
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    <p className="truncate text-ink-2">{item.sourceLabel}</p>
                    <p className="mt-0.5 uppercase text-ink-4">{item.provider ?? "-"}</p>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={displayStatus(item)} />
                    {item.operations.some((operation) => operation.status === "requested") ? <p className="mt-1 text-[10px] font-semibold text-amber-700">승인 대기</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <p className="text-xs font-semibold text-foreground">{formatMoney(item.currency, item.paidAmount)}</p>
                    <p className={cn("mt-0.5 text-[10px]", item.refundedAmount > 0 ? "text-blue-700" : "text-ink-4")}>환불 {formatMoney(item.currency, item.refundedAmount)}</p>
                  </td>
                  <td className="px-2 py-2 text-ink-4"><ChevronRight className="size-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border lg:hidden">
          {paged.map((item) => (
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={cn("grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-3 text-left hover:bg-secondary/50", item.needsAttention && "bg-red-50/35")}>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{item.productLabel}</span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-3">{item.customerName} · {item.orderNo ?? "주문번호 없음"}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-4"><StatusChip status={displayStatus(item)} /> {item.sourceLabel}</span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold">{formatMoney(item.currency, item.paidAmount)}</span>
                <span className="mt-1 block text-[10px] text-blue-700">환불 {formatMoney(item.currency, item.refundedAmount)}</span>
              </span>
            </button>
          ))}
        </div>

        {paged.length === 0 ? <p className="p-10 text-center text-sm text-ink-3">조건에 맞는 결제 기록이 없습니다.</p> : null}
        <Pagination page={safePage} pageCount={pageCount} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} total={filtered.length} />
      </section>

      {selected ? (
        <PaymentDetailDrawer
          key={selected.id}
          item={selected}
          currentUserId={currentUserId}
          canExecuteDirectly={canExecuteDirectly}
          generatedAt={generatedAt}
          preview={preview}
          onClose={() => setSelectedId(null)}
          onUpdated={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function Summary({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return <p className="flex items-baseline gap-1.5"><span className="text-ink-4">{label}</span><strong className={cn("text-sm text-foreground", accent && "text-amber-700", danger && "text-red-700")}>{value}</strong></p>;
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{children}</div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-hairline-2 bg-background px-3 text-xs">{options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>;
}

function StatusChip({ status }: { status: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", statusClass(status))}>{STATUS_LABEL[status] ?? OPERATION_STATUS_LABEL[status] ?? status}</span>;
}

function Pagination({ page, pageCount, pageSize, setPage, setPageSize, total }: { page: number; pageCount: number; pageSize: number; setPage: (page: number) => void; setPageSize: (size: number) => void; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-ink-3">
      <span>{total ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} / ${total}` : "0건"}</span>
      <div className="flex items-center gap-1.5">
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-7 rounded-md border border-hairline-2 bg-background px-2"><option value={25}>25개</option><option value={50}>50개</option><option value={100}>100개</option></select>
        <button type="button" aria-label="이전 페이지" disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-7 place-items-center rounded-md border border-hairline-2 disabled:opacity-30"><ChevronLeft className="size-3.5" /></button>
        <span className="min-w-14 text-center">{page} / {pageCount}</span>
        <button type="button" aria-label="다음 페이지" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="grid size-7 place-items-center rounded-md border border-hairline-2 disabled:opacity-30"><ChevronRight className="size-3.5" /></button>
      </div>
    </div>
  );
}

function PaymentDetailDrawer({ item, currentUserId, canExecuteDirectly, generatedAt, preview, onClose, onUpdated }: { item: AdminPaymentRow; currentUserId: string; canExecuteDirectly: boolean; generatedAt: string; preview: boolean; onClose: () => void; onUpdated: () => void }) {
  const [mode, setMode] = useState<"cancel" | "refund" | null>(null);
  const [lineId, setLineId] = useState(item.paymentLines.find((line) => line.canRefund || line.canCancel)?.id ?? item.paymentLines[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("customer_request");
  const [reasonDetail, setReasonDetail] = useState("");
  const [isPending, startTransition] = useTransition();
  const line = item.paymentLines.find((payment) => payment.id === lineId) ?? null;
  const activeForLine = item.operations.some((operation) => operation.sourcePaymentId === lineId && ACTIVE_OPERATION_STATUSES.has(operation.status));

  const estimatedProvider = line && Number(amount) > 0
    ? Number(amount) >= line.refundableAmount
      ? line.refundableProviderAmount
      : Math.round((line.providerAmount * Number(amount) / line.amount + Number.EPSILON) * 100) / 100
    : 0;
  const formTitle = mode === "refund"
    ? canExecuteDirectly ? "환불 즉시 실행" : "환불 요청"
    : canExecuteDirectly ? "결제 전 취소 즉시 실행" : "결제 전 취소 요청";
  const submitLabel = canExecuteDirectly
    ? mode === "refund" ? "환불 즉시 실행" : "결제 전 취소 즉시 실행"
    : "승인 요청 등록";

  const runAction = (task: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    startTransition(async () => {
      const result = await task();
      onUpdated();
      if (result.ok) {
        toast.success(result.message ?? "처리했습니다.");
        setMode(null);
        setReasonDetail("");
      } else toast.error(result.error ?? "처리하지 못했습니다.");
    });
  };

  const submitRequest = () => {
    if (!line || !mode) return;
    if (preview) {
      toast.success("QA 미리보기에서는 요청을 저장하거나 PG로 전송하지 않습니다.");
      setMode(null);
      return;
    }
    if (canExecuteDirectly) {
      const operationLabel = mode === "refund"
        ? `${formatMoney(line.currency, Number(amount))} 환불`
        : "결제 전 취소";
      const confirmed = window.confirm(
        `${operationLabel}을 즉시 실행합니다.\n\n다른 관리자 승인 없이 PG와 내부 원장에 바로 반영됩니다.\n\n정말 실행하시겠습니까?`,
      );
      if (!confirmed) return;
    }
    runAction(() => requestPaymentOperationAction({
      operationType: mode,
      source: item.source as "grigoent" | "workshop" | "workshop_event",
      paymentId: line.id,
      ...(mode === "refund" ? { amount: Number(amount) } : {}),
      reasonCode: reasonCode as "customer_request" | "duplicate" | "schedule_change" | "service_issue" | "other",
      reasonDetail,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal="true" aria-label="결제 상세">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5"><StatusChip status={displayStatus(item)} /><span className="text-[10px] text-ink-4">{item.sourceLabel}</span></div>
            <h2 className="mt-2 truncate text-lg font-bold">{item.productLabel}</h2>
            <p className="mt-1 font-mono text-xs text-ink-3">{item.orderNo ?? "주문번호 없음"}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg border border-hairline-2"><X className="size-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section className="grid grid-cols-3 gap-2">
            <AmountCard label="원결제" value={formatMoney(item.currency, item.totalAmount)} />
            <AmountCard label="순결제" value={formatMoney(item.currency, item.paidAmount)} />
            <AmountCard label="환불 누계" value={formatMoney(item.currency, item.refundedAmount)} accent={item.refundedAmount > 0} />
          </section>

          <DetailSection title="고객·주문">
            <DetailRow label="고객" value={item.customerName} />
            <DetailRow label="이메일" value={item.customerEmail} />
            <DetailRow label="전화" value={item.customerPhone ?? "-"} />
            <DetailRow label="주문일" value={formatDate(item.createdAt)} />
            <DetailRow label="결제일" value={formatDate(item.paidAt)} />
            {item.auditFingerprint ? <DetailRow label="익명 접속 식별자" value={item.auditFingerprint} /> : null}
            {item.auditReferrer ? <DetailRow label="유입 경로" value={item.auditReferrer} /> : null}
            {item.auditUserAgent ? <DetailRow label="브라우저" value={item.auditUserAgent} /> : null}
            {item.planLabel ? <DetailRow label="플랜·세션" value={item.planLabel} /> : null}
            {item.memo ? <DetailRow label="메모" value={item.memo} /> : null}
          </DetailSection>

          {item.source === "visa_mirror" ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              이 행은 deetz 운영용 미러입니다.
              실제 환불은 같은 주문번호의 grigoent 원천 결제 행에서 요청해야 합니다.
            </div>
          ) : null}

          {item.paymentLines.length ? (
            <DetailSection title={`결제 건 ${item.paymentLines.length}개`}>
              <div className="space-y-2">
                {item.paymentLines.map((payment) => (
                  <button key={payment.id} type="button" onClick={() => setLineId(payment.id)} className={cn("w-full rounded-lg border p-3 text-left", lineId === payment.id ? "border-foreground/35 bg-secondary/45" : "border-border")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold">{item.paymentLines.length > 1 ? `${payment.sequence}회차` : "원결제"} · {(payment.provider ?? "-").toUpperCase()}</p>
                        <p className="mt-1 font-mono text-[10px] text-ink-4">{payment.id}</p>
                      </div>
                      <StatusChip status={payment.refundedAmount > 0 && payment.refundableAmount > 0 ? "partially_refunded" : payment.refundableAmount <= 0 && payment.refundedAmount > 0 ? "refunded" : payment.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <MiniAmount label="승인" value={formatMoney(payment.currency, payment.amount)} />
                      <MiniAmount label="환불" value={formatMoney(payment.currency, payment.refundedAmount)} />
                      <MiniAmount label="가능" value={formatMoney(payment.currency, payment.refundableAmount)} />
                    </div>
                    {payment.providerCurrency !== payment.currency ? <p className="mt-2 text-[10px] text-ink-4">PG 승인 {formatMoney(payment.providerCurrency, payment.providerAmount)} · 환불 가능 {formatMoney(payment.providerCurrency, payment.refundableProviderAmount)}</p> : null}
                  </button>
                ))}
              </div>
            </DetailSection>
          ) : null}

          {line && item.source !== "visa_mirror" ? (
            <DetailSection title={canExecuteDirectly ? "취소·환불 실행" : "취소·환불 요청"}>
              {activeForLine ? <Warning>이 결제에는 이미 승인 대기 또는 처리 중인 작업이 있습니다.</Warning> : null}
              {!mode ? (
                <div className="flex gap-2">
                  <button type="button" disabled={!line.canRefund || activeForLine} onClick={() => { setMode("refund"); setAmount(String(line.refundableAmount)); }} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-35"><RotateCcw className="size-3.5" /> {canExecuteDirectly ? "환불 실행" : "환불 요청"}</button>
                  <button type="button" disabled={!line.canCancel || activeForLine} onClick={() => setMode("cancel")} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline-2 px-3 text-xs font-semibold disabled:opacity-35"><X className="size-3.5" /> {canExecuteDirectly ? "결제 전 취소 실행" : "결제 전 취소"}</button>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold">{formTitle}</p><button type="button" onClick={() => setMode(null)} className="text-[11px] text-ink-3">닫기</button></div>
                  {mode === "refund" ? (
                    <div>
                      <label className="text-[11px] font-medium text-ink-2">환불 금액 ({line.currency})</label>
                      <div className="mt-1 flex gap-2">
                        <input type="number" min={line.currency === "KRW" ? 1 : 0.01} max={line.refundableAmount} step={line.currency === "KRW" ? 1 : 0.01} value={amount} onChange={(event) => setAmount(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-hairline-2 bg-background px-3 text-sm" />
                        <button type="button" onClick={() => setAmount(String(line.refundableAmount))} className="h-9 rounded-lg border border-hairline-2 px-3 text-xs">전액</button>
                      </div>
                      <p className="mt-1 text-[10px] text-ink-4">PG 요청 예상액 {formatMoney(line.providerCurrency, estimatedProvider)} · 실제 승인 시 서버가 다시 계산합니다.</p>
                    </div>
                  ) : null}
                  <div>
                    <label className="text-[11px] font-medium text-ink-2">사유 분류</label>
                    <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-hairline-2 bg-background px-3 text-xs">{REASON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-ink-2">상세 사유</label>
                    <textarea value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} maxLength={500} rows={3} placeholder="고객 요청 내용과 판단 근거를 남겨 주세요." className="mt-1 w-full resize-none rounded-lg border border-hairline-2 bg-background p-3 text-xs" />
                  </div>
                  <p className={cn("rounded-md px-2.5 py-2 text-[10px] leading-4", canExecuteDirectly ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800")}>
                    {canExecuteDirectly
                      ? "실행 버튼을 누르면 다른 관리자 승인 없이 PG 취소·환불과 내부 원장 반영을 바로 시작합니다."
                      : "요청 등록만으로 돈이 이동하지 않습니다. 다른 관리자가 승인해야 PG 취소·환불이 실행됩니다."}
                  </p>
                  <button type="button" disabled={isPending || reasonDetail.trim().length < 2 || (mode === "refund" && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > line.refundableAmount))} onClick={submitRequest} className="h-9 w-full rounded-lg bg-foreground text-xs font-semibold text-background disabled:opacity-40">{isPending ? canExecuteDirectly ? "실행 중…" : "등록 중…" : submitLabel}</button>
                </div>
              )}
            </DetailSection>
          ) : null}

          <DetailSection title={`작업 이력 ${item.operations.length}건`}>
            {item.operations.length ? <div className="space-y-2">{item.operations.map((operation) => <OperationCard key={operation.id} operation={operation} currentUserId={currentUserId} canExecuteDirectly={canExecuteDirectly} generatedAt={generatedAt} preview={preview} pending={isPending} runAction={runAction} />)}</div> : <p className="text-xs text-ink-4">취소·환불 작업 이력이 없습니다.</p>}
          </DetailSection>

          {item.paymentLines.some((payment) => payment.refunds.length) ? (
            <DetailSection title="PG 환불 이력">
              <div className="space-y-2">{item.paymentLines.flatMap((payment) => payment.refunds).map((refund) => (
                <div key={refund.id} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2"><StatusChip status={refund.status} /><span className="font-semibold">{formatMoney(refund.currency, refund.amount)}</span></div>
                  <p className="mt-1 text-[11px] text-ink-3">PG {formatMoney(refund.providerCurrency, refund.providerAmount)} · {refund.providerRefundId ?? "거래 ID 대기"}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{refund.reason}</p>
                  <p className="mt-1 text-[10px] text-ink-4">{formatDate(refund.requestedAt)}</p>
                </div>
              ))}</div>
            </DetailSection>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function OperationCard({ operation, currentUserId, canExecuteDirectly, generatedAt, preview, pending, runAction }: { operation: AdminPaymentOperation; currentUserId: string; canExecuteDirectly: boolean; generatedAt: string; preview: boolean; pending: boolean; runAction: (task: () => Promise<{ ok: boolean; error?: string; message?: string }>) => void }) {
  const mine = operation.requestedBy === currentUserId;
  const staleProcessing = operation.status === "processing"
    && Boolean(operation.processedAt)
    && new Date(generatedAt).getTime() - new Date(operation.processedAt as string).getTime() >= 5 * 60 * 1000;
  const canReconcile = ["provider_pending", "reconciliation_required"].includes(operation.status) || staleProcessing;
  const previewAction = () => Promise.resolve({ ok: true, message: "QA 미리보기에서는 실제 작업을 실행하지 않습니다." });
  const executeOwnRequest = () => {
    if (!preview) {
      const operationLabel = operation.operationType === "refund"
        ? `${formatMoney(operation.currency, operation.amount)} 환불`
        : "결제 전 취소";
      if (!window.confirm(`${operationLabel}을 즉시 실행합니다.\n\n다른 관리자 승인 없이 PG와 내부 원장에 바로 반영됩니다.\n\n정말 실행하시겠습니까?`)) return;
    }
    runAction(preview ? previewAction : () => approvePaymentOperationAction({ operationId: operation.id }));
  };
  return (
    <div className="rounded-lg border border-border p-3 text-xs">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><StatusChip status={operation.status} /><span className="font-semibold">{operation.operationType === "refund" ? "환불" : "취소"}</span>{operation.executionMode === "direct" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">직접 실행</span> : null}</div><span className="font-semibold">{operation.operationType === "refund" ? formatMoney(operation.currency, operation.amount) : "결제 전 취소"}</span></div>
      <p className="mt-2 text-ink-2">{operation.reasonDetail}</p>
      <p className="mt-1 text-[10px] text-ink-4">요청 {operation.requestedByName} · {formatDate(operation.requestedAt)}</p>
      {operation.approvedByName ? <p className="mt-0.5 text-[10px] text-ink-4">승인 {operation.approvedByName} · {formatDate(operation.approvedAt)}</p> : null}
      {operation.errorMessage ? <p className="mt-1 rounded bg-red-50 px-2 py-1.5 text-[10px] text-red-700">{operation.errorMessage}</p> : null}
      {operation.status === "requested" ? (
        <div className="mt-3 flex gap-2">
          {mine ? (
            <>
              <button type="button" disabled={pending} onClick={() => runAction(preview ? previewAction : () => rejectPaymentOperationAction({ operationId: operation.id }))} className="h-8 flex-1 rounded-lg border border-hairline-2 text-[11px] font-semibold disabled:opacity-40">내 요청 취소</button>
              {canExecuteDirectly ? <button type="button" disabled={pending} onClick={executeOwnRequest} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-foreground text-[11px] font-semibold text-background disabled:opacity-40"><Check className="size-3" /> 즉시 실행</button> : null}
            </>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => runAction(preview ? previewAction : () => rejectPaymentOperationAction({ operationId: operation.id }))} className="h-8 flex-1 rounded-lg border border-hairline-2 text-[11px] font-semibold disabled:opacity-40">거절</button>
              <button type="button" disabled={pending} onClick={() => runAction(preview ? previewAction : () => approvePaymentOperationAction({ operationId: operation.id }))} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-foreground text-[11px] font-semibold text-background disabled:opacity-40"><Check className="size-3" /> 승인·실행</button>
            </>
          )}
        </div>
      ) : null}
      {canReconcile ? (
        <button type="button" disabled={pending} onClick={() => runAction(preview ? previewAction : () => reconcilePaymentOperationAction({ operationId: operation.id }))} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-hairline-2 text-[11px] font-semibold disabled:opacity-40"><RefreshCw className="size-3" /> {operation.operationType === "refund" ? "PG 상태 다시 확인" : "취소 상태 다시 확인"}</button>
      ) : null}
    </div>
  );
}

function AmountCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-ink-4">{label}</p><p className={cn("mt-1 truncate text-sm font-bold", accent && "text-blue-700")}>{value}</p></div>;
}

function MiniAmount({ label, value }: { label: string; value: string }) {
  return <span><span className="block text-[9px] text-ink-4">{label}</span><strong className="mt-0.5 block truncate font-semibold">{value}</strong></span>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-4">{title}</h3>{children}</section>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-border py-2 text-xs last:border-b-0"><span className="text-ink-4">{label}</span><span className="min-w-0 break-words text-foreground">{value}</span></div>;
}

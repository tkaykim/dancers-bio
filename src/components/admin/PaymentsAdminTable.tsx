"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import type { AdminPaymentRow } from "@/lib/admin/payments";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  unpaid: "미결제",
  link_sent: "링크 발송",
  pending: "결제 대기",
  active: "분할 결제 중",
  paid: "결제 완료",
  completed: "결제 완료",
  refunded: "환불됨",
  cancelled: "취소",
  failed: "결제 실패",
  confirmed: "참가 확정",
  transferred: "양도 처리",
  recovery_required: "확인 필요",
};

const SOURCE_LABEL: Record<string, string> = {
  all: "전체 결제",
  grigoent: "grigoent 원장",
  visa_mirror: "비자 미러",
  workshop: "워크샵 예약",
  workshop_event: "워크샵 행사",
};

const STATUS_OPTIONS = [
  ["all", "전체 상태"],
  ["paid_or_completed", "결제 완료"],
  ["pending", "결제 대기"],
  ["link_sent", "링크 발송"],
  ["active", "분할 결제 중"],
  ["failed", "결제 실패"],
  ["refunded", "환불됨"],
  ["cancelled", "취소"],
  ["recovery_required", "확인 필요"],
] as const;

function formatMoney(currency: string, amount: number | null): string {
  if (amount === null) return "-";
  const value = amount.toLocaleString(currency === "KRW" ? "ko-KR" : "en-US", { maximumFractionDigits: 2 });
  if (currency === "KRW") return `₩${value}`;
  if (currency === "THB") return `฿${value}`;
  if (currency === "USD") return `$${value}`;
  return `${currency} ${value}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  if (["completed", "paid", "confirmed", "transferred"].includes(status)) return "bg-ok/15 text-ok";
  if (["failed", "recovery_required"].includes(status)) return "bg-red-100 text-red-700";
  if (["pending", "link_sent", "active"].includes(status)) return "bg-warn/15 text-warn";
  return "bg-secondary text-ink-3";
}

export function PaymentsAdminTable({
  items,
  warnings,
  grigoentConfigured,
  generatedAt,
}: {
  items: AdminPaymentRow[];
  warnings: string[];
  grigoentConfigured: boolean;
  generatedAt: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const products = useMemo(
    () => Array.from(new Map(items.map((item) => [item.productSlug ?? item.productLabel, item.productLabel])).entries()).sort((a, b) => a[1].localeCompare(b[1], "ko")),
    [items],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (status === "paid_or_completed" && !["paid", "completed"].includes(item.status)) return false;
      if (status !== "all" && status !== "paid_or_completed" && item.status !== status) return false;
      if (product !== "all" && (item.productSlug ?? item.productLabel) !== product) return false;
      if (attentionOnly && !item.needsAttention) return false;
      if (!normalized) return true;
      return [item.orderNo, item.customerName, item.customerEmail, item.productLabel, item.planLabel, item.attentionReason]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [attentionOnly, items, product, query, source, status]);

  const completed = items.filter((item) => ["paid", "completed", "confirmed", "transferred"].includes(item.status));
  const pending = items.filter((item) => ["pending", "link_sent", "active"].includes(item.status));
  const attention = items.filter((item) => item.needsAttention);
  const completedKrw = completed
    .filter((item) => item.currency === "KRW")
    .reduce((sum, item) => sum + item.paidAmount, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="전체 기록" value={`${items.length}건`} />
        <Metric label="결제 완료" value={`${completed.length}건`} detail={`KRW ${completedKrw.toLocaleString("ko-KR")}`} />
        <Metric label="대기 중" value={`${pending.length}건`} />
        <Metric label="확인 필요" value={`${attention.length}건`} tone={attention.length > 0} />
      </section>

      {!grigoentConfigured ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          grigoent 연결이 설정되지 않아 deetz 내부 결제만 표시됩니다.
          배포 환경에 <code className="font-mono text-xs">GRIGOENT_SUPABASE_URL</code>과 <code className="font-mono text-xs">GRIGOENT_SUPABASE_SERVICE_ROLE_KEY</code>를 등록해 주세요.
        </div>
      ) : null}
      {warnings.map((warning) => (
        <div key={warning} className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          {warning}
        </div>
      ))}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="주문번호, 고객명, 이메일, 상품 검색"
              className="w-full rounded-lg border border-hairline-2 bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm">
            {Object.entries(SOURCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm">
            {STATUS_OPTIONS.map(([value, label], index) => <option key={`${value}-${index}`} value={value}>{label}</option>)}
          </select>
          <select value={product} onChange={(event) => setProduct(event.target.value)} className="rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm">
            <option value="all">전체 상품</option>
            {products.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setAttentionOnly((value) => !value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium",
              attentionOnly ? "border-red-300 bg-red-50 text-red-700" : "border-hairline-2 text-ink-2",
            )}
          >
            확인 필요만
          </button>
          <button type="button" onClick={() => router.refresh()} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline-2 px-3 py-2 text-sm text-ink-2 hover:text-foreground">
            <RefreshCw className="size-3.5" /> 새로고침
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-4">
          <span>{filtered.length}건 표시 · 전체 {items.length}건</span>
          <span>마지막 조회 {formatDate(generatedAt)}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(210px,1.3fr)_minmax(180px,1fr)_140px_170px] gap-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4 lg:grid">
          <span>상품 · 고객</span>
          <span>주문 · 연결</span>
          <span>상태</span>
          <span className="text-right">금액 · 결제일</span>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((item) => <PaymentRow key={item.id} item={item} />)}
          {filtered.length === 0 ? <p className="p-10 text-center text-sm text-ink-3">조건에 맞는 결제 기록이 없습니다.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", tone && "border-red-200 bg-red-50/50")}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", tone && "text-red-700")}>{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-ink-4">{detail}</p> : null}
    </div>
  );
}

function PaymentRow({ item }: { item: AdminPaymentRow }) {
  const isCompleted = ["paid", "completed", "confirmed", "transferred"].includes(item.status);
  const amountText = item.totalAmount === null
    ? "금액 미정"
    : `${formatMoney(item.currency, item.paidAmount)} / ${formatMoney(item.currency, item.totalAmount)}`;
  return (
    <article className={cn("grid gap-3 px-4 py-4 lg:grid-cols-[minmax(210px,1.3fr)_minmax(180px,1fr)_140px_170px]", item.needsAttention && "bg-red-50/40")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-3">{item.sourceLabel}</span>
          {item.isTest ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">TEST</span> : null}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-foreground" title={item.productLabel}>{item.productLabel}</p>
        {item.planLabel ? <p className="truncate text-[11px] text-ink-3" title={item.planLabel}>{item.planLabel}</p> : null}
        <p className="mt-1 truncate text-xs text-ink-2">{item.customerName} · {item.customerEmail}</p>
        {item.customerPhone ? <p className="text-[11px] text-ink-4">{item.customerPhone}</p> : null}
      </div>
      <div className="min-w-0 text-xs text-ink-3">
        <p className="font-mono text-foreground">{item.orderNo ?? "주문번호 없음"}</p>
        <p className="mt-1">{formatDate(item.createdAt)}</p>
        <p className="mt-1">
          {item.deetzApplicationId ? `deetz 케이스 ${item.deetzApplicationId.slice(0, 8)}…` : "deetz 케이스 미연결"}
        </p>
        {item.paymentCount > 1 ? <p className="mt-1">회차 결제 {item.paymentCount}건{item.failedPaymentCount ? ` · 실패 ${item.failedPaymentCount}건` : ""}</p> : null}
      </div>
      <div>
        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", statusClass(item.status))}>
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
        {item.provider ? <p className="mt-1 text-[11px] text-ink-4">{item.provider}</p> : null}
        {item.needsAttention ? <p className="mt-1 text-[11px] font-semibold text-red-700">{item.attentionReason}</p> : null}
      </div>
      <div className="text-left lg:text-right">
        <p className="font-semibold text-foreground">{amountText}</p>
        {item.refundedAmount > 0 ? <p className="mt-1 text-[11px] text-red-700">환불 {formatMoney(item.currency, item.refundedAmount)}</p> : null}
        <p className="mt-1 text-[11px] text-ink-4">{isCompleted ? `결제 ${formatDate(item.paidAt)}` : `생성 ${formatDate(item.createdAt)}`}</p>
        {item.memo ? <p className="mt-1 truncate text-[11px] text-ink-4" title={item.memo}>{item.memo}</p> : null}
      </div>
    </article>
  );
}

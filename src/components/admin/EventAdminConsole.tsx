"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { adminSetEventOrderStatusAction } from "@/app/actions/workshop-events";
import { cn } from "@/lib/utils";
import { EVENT_ORDER_STATUS_LABEL, hhmm } from "@/lib/workshops/event-shared";
import type { AdminEventListRow, AdminEventOrder, AdminEventSession } from "@/lib/workshops/event-queries";

// 행사 운영 콘솔 — 세션별 n/정원(관리자 전용), 주문 목록·상태 기록.
// 환불은 토스/PayPal 콘솔에서 먼저 집행하고 여기서 상태만 기록한다.

export function EventAdminConsole({
  event,
  sessions,
  orders,
}: {
  event: AdminEventListRow;
  sessions: AdminEventSession[];
  orders: AdminEventOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterSession, setFilterSession] = useState<string>("");

  const setStatus = (id: string, status: "paid" | "cancelled" | "refunded") => {
    startTransition(async () => {
      const res = await adminSetEventOrderStatusAction({ id, status });
      if (res.ok) {
        toast.success(`${EVENT_ORDER_STATUS_LABEL[status]} 처리했습니다.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const sessionTitle = new Map(sessions.map((s) => [s.id, s.title]));
  const shown = filterSession
    ? orders.filter((o) => o.session_ids.includes(filterSession))
    : orders;
  const paidTotal = orders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.amount_krw, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/workshops/e/${event.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline-offset-2 hover:underline"
        >
          공개 페이지 <ExternalLink className="size-3.5" />
        </a>
        <span className="text-[13px] text-ink-3">
          결제 완료 {orders.filter((o) => o.status === "paid").length}건 · ₩{paidTotal.toLocaleString("ko-KR")} 상당
        </span>
      </div>

      {/* 세션별 현황 — 정원은 여기서만 보인다 */}
      <div className="grid gap-3 md:grid-cols-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilterSession(filterSession === s.id ? "" : s.id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              filterSession === s.id ? "border-foreground bg-primary/5" : "border-hairline-2 bg-card",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-foreground">{s.title}</p>
              <p className="font-mono text-[12px] text-ink-3">
                {s.session_date} {hhmm(s.start_time)}–{hhmm(s.end_time)}
              </p>
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {s.instructor_name}
              {s.level ? ` · ${s.level}` : ""}
              {s.price_local !== null ? ` · ${Number(s.price_local).toLocaleString("en-US")}` : ""}
              {s.price_krw !== null ? ` / ₩${s.price_krw.toLocaleString("ko-KR")}` : ""}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-bold",
                  s.paid_count >= s.capacity
                    ? "bg-red-100 text-red-700"
                    : "bg-ok/15 text-ok",
                )}
              >
                결제 {s.paid_count} / 정원 {s.capacity}
              </span>
              {s.active_count > s.paid_count ? (
                <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[12px] font-bold text-warn">
                  홀드 {s.active_count - s.paid_count}
                </span>
              ) : null}
              {s.status === "closed" ? (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-bold text-ink-3">수동 마감</span>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {/* 주문 목록 */}
      <div className="rounded-xl border border-hairline-2 bg-card p-4">
        <p className="text-[13px] font-bold text-foreground">
          주문 {shown.length}건{filterSession ? ` — ${sessionTitle.get(filterSession)}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-4">
          환불은 토스/PayPal 콘솔에서 먼저 집행한 뒤 여기서 상태를 기록하세요.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {shown.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/30 px-3 py-2 text-[12px]"
            >
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  o.status === "paid"
                    ? "bg-ok/15 text-ok"
                    : o.status === "recovery_required"
                      ? "bg-red-100 font-bold text-red-700"
                      : o.status === "pending"
                        ? "bg-warn/15 text-warn"
                        : "bg-secondary text-ink-3",
                )}
              >
                {EVENT_ORDER_STATUS_LABEL[o.status as keyof typeof EVENT_ORDER_STATUS_LABEL] ?? o.status}
              </span>
              <span className="font-semibold text-foreground">{o.customer_name}</span>
              <span className="text-ink-3">{o.customer_email}</span>
              {o.customer_phone ? <span className="text-ink-3">{o.customer_phone}</span> : null}
              <span className="font-mono text-ink-4">{o.order_no}</span>
              <span className="font-semibold text-foreground">
                {o.charged_currency && o.charged_amount !== null
                  ? `${o.charged_currency} ${Number(o.charged_amount).toLocaleString("en-US")}`
                  : `₩${o.amount_krw.toLocaleString("ko-KR")}`}
              </span>
              <span className="text-ink-4">
                {o.session_ids.map((id) => sessionTitle.get(id) ?? "?").join(", ")}
              </span>
              <span className="ml-auto flex gap-1">
                {(o.status === "paid"
                  ? (["refunded"] as const)
                  : o.status === "recovery_required"
                    ? (["paid", "refunded"] as const)
                    : o.status === "pending"
                      ? (["cancelled"] as const)
                      : []
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending}
                    onClick={() => setStatus(o.id, s)}
                    className="rounded-md border border-hairline-2 px-2 py-1 text-[11px] text-ink-2 transition-colors hover:text-foreground disabled:opacity-45"
                  >
                    {EVENT_ORDER_STATUS_LABEL[s]}
                  </button>
                ))}
              </span>
            </div>
          ))}
          {shown.length === 0 ? <p className="py-4 text-center text-[12px] text-ink-4">주문이 없습니다.</p> : null}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { CheckCircle2, Clock, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { won } from "@/lib/workshops/shared";
import type { MyReservation } from "@/lib/workshops/queries";

// 이미 예약한 사용자에게 결제 폼 대신 보여주는 상태 카드.
// 이게 없으면 결제한 사람이 상세에 다시 왔을 때 결제 폼만 보여 "또 내야 하나" 문의가 발생한다.

/** 렌더 본문에서 Date.now() 를 직접 부르면 purity 규칙에 걸린다 — 모듈 레벨 헬퍼로 감싼다. */
function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function MyReservationCard({
  reservation,
  artistStatus,
}: {
  reservation: MyReservation;
  artistStatus: string;
}) {
  const paid = reservation.status === "paid" || reservation.status === "confirmed";
  const refunded = reservation.status === "refunded";
  const transferred = reservation.status === "transferred";
  const recovery = reservation.status === "recovery_required";

  // 돈은 받았지만 자동 확정하지 못한 건 — 실패라고 하면 거짓말이므로 사실대로 안내한다.
  if (recovery) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border-2 border-warn/50 bg-warn/5 p-5">
        <p className="text-base font-bold tracking-tight text-foreground">결제 확인 중입니다</p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">결제는 정상적으로 완료되었습니다.</span>
          <span className="block">예약 확정 처리에 확인이 필요해 운영진이 직접 살펴보고 있어요.</span>
          <span className="block">곧 메일로 결과를 안내드립니다.</span>
        </p>
        <p className="text-[12px] text-ink-3">
          결제번호 <span className="font-mono font-semibold text-foreground">{reservation.order_no}</span> ·{" "}
          {won(reservation.amount)}
        </p>
        <a
          href="mailto:contact@deetz.kr"
          className="mt-1 w-fit rounded-lg border border-hairline-2 bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
        >
          문의하기
        </a>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="text-base font-bold tracking-tight text-foreground">
            {reservation.status === "confirmed" ? "참가가 확정되었습니다" : "예약이 완료되었습니다"}
          </p>
        </div>
        <dl className="flex flex-col gap-1.5 rounded-lg bg-background/70 p-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">결제번호</dt>
            <dd className="font-mono font-semibold text-foreground">{reservation.order_no}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">납부한 예약금</dt>
            <dd className="font-bold text-foreground">{won(reservation.amount)}</dd>
          </div>
          {reservation.paid_at ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">결제 일시</dt>
              <dd className="text-ink-2">
                {new Intl.DateTimeFormat("ko-KR", {
                  timeZone: "Asia/Seoul",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(reservation.paid_at))}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[13px] leading-relaxed text-ink-2">
          {artistStatus === "confirmed" ? (
            <>
              <span className="block">초청이 확정되었습니다.</span>
              <span className="block">일정과 잔금 결제 방법을 메일로 안내드립니다.</span>
            </>
          ) : (
            <>
              <span className="block">최소 인원이 모이면 초청이 확정됩니다.</span>
              <span className="block">확정되면 일정과 잔금 안내를 메일로 보내드립니다.</span>
              <span className="block">인원 미달로 열리지 않으면 예약금은 전액 환불됩니다.</span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {reservation.receipt_url ? (
            <a
              href={reservation.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-hairline-2 bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
            >
              영수증 보기
            </a>
          ) : null}
          <Link
            href="/me/workshops"
            className="rounded-lg border border-hairline-2 bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
          >
            내 예약 전체 보기
          </Link>
          <a
            href="mailto:contact@deetz.kr"
            className="rounded-lg px-4 py-2 text-[13px] text-ink-3 transition-colors hover:text-foreground"
          >
            취소·양도 문의
          </a>
        </div>
      </div>
    );
  }

  if (refunded || transferred) {
    return (
      <div className="rounded-xl border border-hairline-2 bg-card p-5">
        <p className="text-sm font-bold text-foreground">
          {refunded ? "환불 처리된 예약입니다" : "양도 처리된 예약입니다"}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          <span className="block">결제번호 {reservation.order_no}</span>
          <span className="block">문의는 contact@deetz.kr 로 보내주세요.</span>
        </p>
      </div>
    );
  }

  // pending — 결제창을 열었다가 완료하지 못한 상태
  const expired = isPast(reservation.expires_at);
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/5 p-4")}>
      <div className="flex items-center gap-2">
        {expired ? <RotateCcw className="size-4 text-warn" /> : <Clock className="size-4 text-warn" />}
        <p className="text-sm font-bold text-foreground">
          {expired ? "결제 시간이 지났습니다" : "결제가 완료되지 않았습니다"}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-2">
        <span className="block">결제번호 {reservation.order_no} 건이 결제 대기 상태예요.</span>
        <span className="block">아래에서 다시 결제하시면 자리가 확정됩니다.</span>
      </p>
    </div>
  );
}

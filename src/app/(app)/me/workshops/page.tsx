import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth/guard";
import { listMyWorkshopReservations } from "@/lib/workshops/queries";
import { RESERVATION_STATUS_LABEL, won, type ReservationStatus } from "@/lib/workshops/shared";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 워크샵 예약 | deetz" };

const TONE: Partial<Record<ReservationStatus, string>> = {
  paid: "bg-ok/15 text-ok",
  confirmed: "bg-ok/15 text-ok",
  pending: "bg-warn/15 text-warn",
  refunded: "bg-secondary text-ink-3",
  transferred: "bg-secondary text-ink-3",
};

export default async function MyWorkshopsPage() {
  await requireUser();
  const rows = await listMyWorkshopReservations();

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-8 lg:mx-auto lg:max-w-2xl">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          내 정보
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">내 워크샵 예약</h1>
        <p className="mt-1 text-sm text-ink-3">예약금 결제 내역과 진행 상태를 확인할 수 있어요.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">아직 예약한 워크샵이 없습니다.</p>
          <Link
            href="/workshops"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            워크샵 둘러보기
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-hairline-2 bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold",
                    TONE[r.status as ReservationStatus] ?? "bg-secondary text-ink-3",
                  )}
                >
                  {RESERVATION_STATUS_LABEL[r.status as ReservationStatus] ?? r.status}
                </span>
                {r.artist_status === "confirmed" ? (
                  <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                    초청 확정
                  </span>
                ) : null}
              </div>

              <p className="mt-2.5 text-base font-bold tracking-tight text-foreground">
                {r.artist_name} 초청 워크샵
              </p>
              {r.expected_period ? (
                <p className="text-[12px] text-ink-3">예상 시기 {r.expected_period}</p>
              ) : null}

              <dl className="mt-3 flex flex-col gap-1.5 rounded-lg bg-secondary/40 p-3.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">결제번호</dt>
                  <dd className="font-mono font-semibold text-foreground">{r.order_no}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">예약금</dt>
                  <dd className="font-bold text-foreground">{won(r.amount)}</dd>
                </div>
                {r.total_price ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">총 참가비</dt>
                    <dd className="text-ink-2">{won(r.total_price)} (잔금은 확정 후 안내)</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.artist_slug ? (
                  <Link
                    href={`/workshops/${r.artist_slug}`}
                    className="rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
                  >
                    {r.status === "pending" ? "결제 이어서 하기" : "진행 상황 보기"}
                  </Link>
                ) : null}
                {r.receipt_url ? (
                  <a
                    href={r.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
                  >
                    영수증
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] leading-relaxed text-ink-4">
        <span className="block">취소·양도 요청은 contact@deetz.kr 로 보내주세요.</span>
        <span className="block">인원 미달로 워크샵이 열리지 않으면 예약금은 전액 환불됩니다.</span>
      </p>
    </div>
  );
}

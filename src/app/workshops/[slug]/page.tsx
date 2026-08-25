import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Users } from "lucide-react";

import { InstagramGlyph } from "@/components/workshops/InstagramGlyph";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { ReserveCheckout } from "@/components/workshops/ReserveCheckout";
import { VoteBox } from "@/components/workshops/VoteBox";
// 상세·결제 페이지는 한국어 운영 기준(규정·결제 문구) — 랜딩만 다국어다.
import { T, splitSentences } from "@/components/workshops/copy";

const C = T.ko;
import { getProfile, getUser } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";
import { MyReservationCard } from "@/components/workshops/MyReservationCard";
import { getMyWorkshopReservation, getPublicWorkshopArtistBySlug } from "@/lib/workshops/queries";
import { instagramUrl, won } from "@/lib/workshops/shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getPublicWorkshopArtistBySlug(slug);
  if (!artist) return { title: "deetz Workshop" };
  return {
    title: `${artist.name} 초청 워크샵 · deetz Workshop`,
    description:
      artist.headline ??
      `${artist.name}(@${artist.instagram_handle}) 한국 초청 워크샵. 수요가 모이면 deetz가 섭외합니다.`,
    alternates: { canonical: `/workshops/${slug}` },
  };
}

function Lines({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {splitSentences(text).map((s, i) => (
        <span key={i} className="block">
          {s}
        </span>
      ))}
    </p>
  );
}

/** 렌더 본문에서 Date.now() 를 직접 부르면 purity 규칙에 걸린다 — 모듈 레벨 헬퍼로 감싼다. */
function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function dday(deadline: string | null): string | null {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "마감";
  if (diff === 0) return "오늘 마감";
  return `D-${diff}`;
}

export default async function WorkshopDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getPublicWorkshopArtistBySlug(slug);
  if (!artist) notFound();

  const user = await getUser();
  const profile = user ? await getProfile() : null;
  // 이미 예약한 사람에게 결제 폼을 다시 보여주면 "또 내야 하나" 문의가 생긴다 — 상태를 먼저 읽는다.
  const myReservation = user ? await getMyWorkshopReservation(artist.id) : null;
  const alreadyPaid =
    myReservation?.status === "paid" ||
    myReservation?.status === "confirmed" ||
    myReservation?.status === "transferred" ||
    myReservation?.status === "recovery_required";

  const min = artist.min_headcount ?? 0;
  const pct = min > 0 ? Math.min(100, Math.round((artist.reserved_count / min) * 100)) : 0;
  const remainingToMin = Math.max(0, min - artist.reserved_count);
  const full =
    !!artist.max_headcount && artist.reserved_count >= artist.max_headcount;
  const deadlinePassed = isPast(artist.recruit_deadline);
  const d = dday(artist.recruit_deadline);

  const returnPath = `/workshops/${slug}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col break-keep px-6 pb-16 pt-6 md:max-w-3xl md:px-10 md:pb-24 md:pt-10">
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/workshops"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          전체 워크샵
        </Link>
        <Link href="/workshops" aria-label="deetz Workshop 홈">
          <DeetzLogo className="h-6 w-auto" />
        </Link>
      </div>

      {/* 아티스트 헤더 */}
      <div className="overflow-hidden rounded-2xl border border-hairline-2 bg-card">
        <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
          {artist.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.image_url} alt={artist.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <span className="text-6xl font-bold tracking-tight text-ink-4">
                {artist.name.trim().charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span
            className={cn(
              "absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
              artist.status === "recruiting"
                ? "bg-primary text-primary-foreground"
                : "bg-background/90 text-foreground",
            )}
          >
            {artist.status === "recruiting"
              ? "모집 중"
              : artist.status === "confirmed"
                ? "초청 확정"
                : artist.status === "completed"
                  ? "진행 완료"
                  : "수요 모집"}
          </span>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{artist.name}</h1>
            {artist.country ? <span className="text-[13px] text-ink-3">{artist.country}</span> : null}
          </div>
          <a
            href={instagramUrl(artist.instagram_handle)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
          >
            <InstagramGlyph className="size-3.5" />@{artist.instagram_handle}
          </a>
          {artist.genres.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {artist.genres.map((g) => (
                <span key={g} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] text-ink-2">
                  {g}
                </span>
              ))}
            </div>
          ) : null}
          {artist.headline ? (
            <p className="mt-3 text-[15px] font-semibold leading-relaxed text-foreground">{artist.headline}</p>
          ) : null}
          {artist.description ? (
            <Lines text={artist.description} className="mt-2 text-[14px] leading-relaxed text-ink-2" />
          ) : null}
          <p className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Users className="size-4 text-ink-3" />
            {C.demandBand[artist.demand_band]}
          </p>
        </div>
      </div>

      {/* 상태별 액션 영역 */}
      {artist.status === "recruiting" ? (
        <section className="mt-6 rounded-2xl border-2 border-primary/40 bg-card p-5 md:p-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
              <Flame className="size-3" /> 예약금 모집 중
            </span>
            {d ? <span className="text-[12px] font-semibold text-ink-3">{d}</span> : null}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            {artist.deposit_amount ? (
              <div className="rounded-lg bg-secondary/50 p-3.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">예약금</dt>
                <dd className="mt-0.5 text-xl font-bold tracking-tight">{won(artist.deposit_amount)}</dd>
              </div>
            ) : null}
            {artist.total_price ? (
              <div className="rounded-lg bg-secondary/50 p-3.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">총 수강료</dt>
                <dd className="mt-0.5 text-xl font-bold tracking-tight">{won(artist.total_price)}</dd>
                <dd className="mt-0.5 text-[11px] text-ink-4">예약금 차감 후 잔금 결제</dd>
              </div>
            ) : null}
            {artist.expected_period ? (
              <div className="rounded-lg bg-secondary/50 p-3.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">예상 시기</dt>
                <dd className="mt-0.5 text-sm font-bold">{artist.expected_period}</dd>
              </div>
            ) : null}
            <div className="rounded-lg bg-secondary/50 p-3.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">모집 인원</dt>
              <dd className="mt-0.5 text-sm font-bold">
                최소 {min}명{artist.max_headcount ? ` · 최대 ${artist.max_headcount}명` : ""}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-foreground">
                {artist.reserved_count}명 예약 완료
                {min > 0 ? <span className="text-ink-3"> / 최소 {min}명</span> : null}
              </span>
              <span className="text-[12px] text-ink-3">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            {min > 0 ? (
              <p className="mt-1.5 text-[12px] text-ink-4">
                {remainingToMin > 0
                  ? `${remainingToMin}명만 더 모이면 초청이 확정됩니다.`
                  : "최소 인원 달성 — 확정 준비 중입니다."}
              </p>
            ) : null}
          </div>

          <div className="mt-5 border-t border-hairline-2 pt-5">
            {myReservation && alreadyPaid ? (
              <MyReservationCard reservation={myReservation} artistStatus={artist.status} />
            ) : deadlinePassed ? (
              <p className="rounded-lg bg-secondary/50 px-4 py-3 text-center text-[13px] font-semibold text-ink-2">
                모집이 마감되었습니다. 확정 여부는 예약자분들께 개별 안내드립니다.
              </p>
            ) : full ? (
              <p className="rounded-lg bg-secondary/50 px-4 py-3 text-center text-[13px] font-semibold text-ink-2">
                정원이 가득 찼습니다.
              </p>
            ) : !user ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-[13px] leading-relaxed text-ink-2">
                  <span className="block">예약금 결제에는 deetz 계정이 필요해요.</span>
                  <span className="block">확정·잔금·양도 안내를 계정 기준으로 드리기 위해서예요.</span>
                </p>
                <Link
                  href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                  className="flex items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  로그인하고 예약하기
                </Link>
                <Link
                  href={`/signup?redirect=${encodeURIComponent(returnPath)}`}
                  className="flex items-center justify-center rounded-lg border border-hairline-2 px-5 py-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary/50"
                >
                  회원가입
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {myReservation ? (
                  <MyReservationCard reservation={myReservation} artistStatus={artist.status} />
                ) : null}
                <ReserveCheckout
                  artistId={artist.id}
                  depositAmount={artist.deposit_amount ?? 0}
                  artistSlug={slug}
                  defaultName={profile?.display_name ?? ""}
                  defaultEmail={user.email ?? ""}
                />
              </div>
            )}
          </div>
        </section>
      ) : artist.status === "confirmed" ? (
        <section className="mt-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-center md:p-6">
          <p className="text-lg font-bold tracking-tight">초청이 확정되었습니다 🎉</p>
          <Lines
            text="예약자분들께 일정과 잔금 결제 안내를 개별 발송해 드립니다. 추가 참가 문의는 contact@deetz.kr 로 보내주세요."
            className="mt-2 text-[13px] leading-relaxed text-ink-2"
          />
        </section>
      ) : artist.status === "completed" ? (
        <section className="mt-6 rounded-2xl border border-hairline-2 bg-card p-5 text-center md:p-6">
          <p className="text-base font-bold tracking-tight">이 워크샵은 진행이 완료되었습니다.</p>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-hairline-2 bg-card p-5 md:p-6">
          <p className="text-base font-bold tracking-tight">아직 수요를 모으는 중이에요</p>
          <Lines
            text="수요가 충분히 모이면 deetz가 섭외를 추진하고 예약금 모집을 엽니다. '나도 원해요'를 눌러 힘을 보태주세요."
            className="mt-2 text-[13px] leading-relaxed text-ink-2"
          />
          <VoteBox artistId={artist.id} isLoggedIn={!!user} className="mt-4" />
        </section>
      )}

      {/* 규정 */}
      <h2 className="mb-3.5 mt-11 text-lg font-bold tracking-tight">{C.policyTitle}</h2>
      <ul className="flex flex-col gap-2 rounded-xl border border-hairline-2 bg-card p-5">
        {C.policyRows.map((row) => (
          <li key={row} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            {row}
          </li>
        ))}
      </ul>

      <Lines text={C.disclaimer} className="mt-8 text-[11px] leading-relaxed text-ink-4" />
    </div>
  );
}

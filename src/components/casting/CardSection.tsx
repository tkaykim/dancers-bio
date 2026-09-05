"use client";

import { useEffect, useState } from "react";
import type { BoardView, BoardCard } from "@/lib/casting/board-data";
import type { ClientDecision } from "@/lib/casting/review";
import { ReviewProfileSheet } from "@/components/casting/ReviewProfileSheet";
import {
  resolveCastingCardFields,
  resolveCastingProfileAccess,
} from "@/lib/casting/card-fields";
import {
  ACCOUNT_TYPE_LABEL,
  LINEUP_STATUS_LABEL,
  TIER_LABEL,
  formatKoCount,
  type LineupStatus,
} from "@/lib/casting/forecast";

function instaHandle(url: string | null): string | null {
  if (!url) return null;
  const m = url.replace(/\/+$/, "").match(/instagram\.com\/([^/?#]+)/i);
  return m ? "@" + m[1] : null;
}

function genderKo(g: string | null): string {
  return g === "female" ? "여" : g === "male" ? "남" : "-";
}

type ReviewControls = {
  token: string;
  choices: Record<string, ClientDecision>;
  onChange: (memberId: string, decision: ClientDecision) => void;
  disabled?: boolean;
};

function applicationLabel(card: BoardCard): string | null {
  if (card.confirmedAt) return "확정";
  if (card.applicationStatus === "accepted") return "수락";
  if (card.applicationStatus === "pending") return "대기";
  return null;
}

const DECISION_OPTIONS: Array<{
  value: Exclude<ClientDecision, "undecided">;
  label: string;
  activeClass: string;
}> = [
  {
    value: "selected",
    label: "선택",
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "hold",
    label: "보류",
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
  {
    value: "excluded",
    label: "제외",
    activeClass: "border-slate-700 bg-slate-700 text-white",
  },
];

const LINEUP_BADGE_CLASS: Record<LineupStatus, string> = {
  confirmed: "border-emerald-600/30 bg-emerald-50 text-emerald-700",
  negotiating: "border-amber-500/40 bg-amber-50 text-amber-700",
  proposed: "border-border bg-secondary text-ink-2",
};

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : "?";
}

function Card({
  c,
  fields,
  review,
  onProfileOpen,
  forecastMode = false,
  showAccountMetrics = true,
}: {
  c: BoardCard;
  fields: BoardView["settings"]["fields"];
  review?: ReviewControls;
  onProfileOpen?: (card: BoardCard) => void;
  forecastMode?: boolean;
  showAccountMetrics?: boolean;
}) {
  const handle = instaHandle(c.instagram);
  const visibleFields = resolveCastingCardFields(fields);
  const statusLabel = applicationLabel(c);
  const selectedDecision = review?.choices[c.memberId] ?? "undecided";
  const profileAccess = resolveCastingProfileAccess({
    enabled: visibleFields.profile,
    reviewToken: review?.token,
    dancerId: c.dancerId,
    slug: c.slug,
  });
  const sub = (
    forecastMode
      ? [
          c.accountType ? ACCOUNT_TYPE_LABEL[c.accountType] : null,
          c.gender === "male" || c.gender === "female" ? genderKo(c.gender) : null,
        ]
      : [
          genderKo(c.gender),
          c.birthYear ? `${c.birthYear}년생` : null,
          c.height ? `${c.height}cm` : null,
        ]
  )
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card break-inside-avoid">
      <div className="aspect-[3/4] w-full bg-secondary">
        {c.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo} alt={c.name} className="h-full w-full object-cover" />
        ) : forecastMode ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-border">
            <span className="text-4xl font-black text-ink-3">{initialOf(c.name)}</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">
            사진 준비중
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight">
            {c.name}
          </div>
          {forecastMode && c.lineupStatus ? (
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${LINEUP_BADGE_CLASS[c.lineupStatus]}`}
            >
              {LINEUP_STATUS_LABEL[c.lineupStatus]}
            </span>
          ) : review && statusLabel ? (
            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-ink-2">
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className="min-h-[14px] truncate text-[10.5px] text-ink-3">
          {c.koreanName ?? ""}
        </div>
        {sub ? <div className="mt-0.5 text-[12px] font-semibold">{sub}</div> : null}
        {forecastMode ? (
          <div className="mt-1.5 rounded-lg bg-secondary/60 px-2 py-1.5">
            {showAccountMetrics ? (
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <p className="text-[9px] font-semibold text-ink-3">팔로워</p>
                  <p className="text-[12px] font-extrabold tabular-nums text-ink-1">
                    {c.followers != null ? formatKoCount(c.followers) : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold text-ink-3">최근 릴스 평균 조회</p>
                  <p className="text-[12px] font-extrabold tabular-nums text-ink-1">
                    {c.expectedViews != null ? `${formatKoCount(c.expectedViews)} 회` : "확인 중"}
                  </p>
                </div>
              </div>
            ) : null}
            <div className={`${showAccountMetrics ? "mt-1.5 " : ""}flex flex-wrap gap-1`}>
              <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold text-ink-2">
                {c.tier ? TIER_LABEL[c.tier] : "지표 확인 중"}
              </span>
            </div>
          </div>
        ) : null}
        {forecastMode && c.contentDirection ? (
          <div className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-ink-2">
            {c.contentDirection}
          </div>
        ) : null}
        {visibleFields.applicationDetails && c.primaryGenre ? (
          <div className="mt-1 text-[10px] font-medium text-ink-2">
            주 장르 · {c.primaryGenre}
          </div>
        ) : null}
        {visibleFields.career && c.career ? (
          <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-2">
            {c.career}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-1">
          {visibleFields.applicationDetails && c.danceVideoUrl ? (
            <a
              href={c.danceVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-primary/25 bg-primary/5 px-1.5 py-1 text-center text-[10px] font-semibold text-primary hover:bg-primary/10"
            >
              춤 영상 ↗
            </a>
          ) : null}
          {visibleFields.applicationDetails && c.personalProfileUrl ? (
            <a
              href={c.personalProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border bg-background px-1.5 py-1 text-center text-[10px] font-semibold text-ink-1 hover:bg-secondary"
            >
              제출 프로필 ↗
            </a>
          ) : null}
          {visibleFields.instagram && handle ? (
            <a
              href={c.instagram!}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate rounded-md border border-border bg-background px-1.5 py-1 text-center text-[10px] text-primary hover:bg-secondary"
            >
              {handle}
            </a>
          ) : null}
          {profileAccess === "review-sheet" ? (
            <button
              type="button"
              onClick={() => onProfileOpen?.(c)}
              className="rounded-md border border-border bg-background px-1.5 py-1 text-center text-[10px] font-semibold text-ink-1 hover:bg-secondary"
            >
              deetz 프로필 보기
            </button>
          ) : profileAccess === "public-link" ? (
            <a
              href={`https://dancers.bio/${c.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border bg-background px-1.5 py-1 text-center text-[10px] font-semibold text-ink-1 hover:bg-secondary"
            >
              deetz 프로필 ↗
            </a>
          ) : null}
        </div>
        {review ? (
          <div className="mt-2 border-t border-border pt-2">
            <div className="grid grid-cols-3 gap-1">
              {DECISION_OPTIONS.map((option) => {
                const active = selectedDecision === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={review.disabled}
                    onClick={() =>
                      review.onChange(
                        c.memberId,
                        active ? "undecided" : option.value,
                      )
                    }
                    className={`rounded-md border px-1 py-1.5 text-[10px] font-bold transition disabled:opacity-50 ${
                      active
                        ? option.activeClass
                        : "border-border bg-background text-ink-2 hover:bg-secondary"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 처음 노출 줄 수 + '더보기' 한 번에 추가로 펼치는 줄 수.
const INITIAL_ROWS = 3;
const STEP_ROWS = 3;

// 카드 섹션: 처음엔 3줄(열수×3)만, '더보기'를 누를 때마다 3줄씩 추가. 열수는 너비로 계산.
export function CardSection({
  label,
  description,
  cards,
  fields,
  review,
  forecastMode = false,
  showAccountMetrics = true,
}: {
  label: string;
  description?: string;
  cards: BoardCard[];
  fields: BoardView["settings"]["fields"];
  review?: ReviewControls;
  forecastMode?: boolean;
  showAccountMetrics?: boolean;
}) {
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [profileCard, setProfileCard] = useState<BoardCard | null>(null);

  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 2 : w < 768 ? 3 : w < 1024 ? 4 : 5);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  if (cards.length === 0) return null;

  const limit = cols * rows;
  const shown = cards.slice(0, limit);
  const remaining = cards.length - limit; // 남은(아직 안 보이는) 인원
  const nextBatch = Math.min(remaining, cols * STEP_ROWS);
  const canCollapse = remaining <= 0 && rows > INITIAL_ROWS;

  return (
    <section className="mt-7">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 border-b-2 border-ink-1 pb-1 text-[15px] font-extrabold">
        <span>
          {label} ({cards.length}명)
        </span>
        {description ? (
          <span className="text-[11px] font-medium text-ink-3">{description}</span>
        ) : null}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((c) => (
          <Card
            key={c.memberId}
            c={c}
            fields={fields}
            review={review}
            onProfileOpen={setProfileCard}
            forecastMode={forecastMode}
            showAccountMetrics={showAccountMetrics}
          />
        ))}
      </div>
      {remaining > 0 || canCollapse ? (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() =>
              remaining > 0
                ? setRows((r) => r + STEP_ROWS)
                : setRows(INITIAL_ROWS)
            }
            className="rounded-full border border-border bg-card px-5 py-2 text-xs font-semibold text-ink-1 hover:bg-secondary"
          >
            {remaining > 0 ? `더보기 (+${nextBatch}명 · 남은 ${remaining}명)` : "접기"}
          </button>
        </div>
      ) : null}
      {review ? (
        <ReviewProfileSheet
          open={profileCard !== null}
          onOpenChange={(open) => {
            if (!open) setProfileCard(null);
          }}
          reviewToken={review.token}
          card={profileCard}
        />
      ) : null}
    </section>
  );
}

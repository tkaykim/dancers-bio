"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { VideoEmbed } from "@/components/portfolio/VideoEmbed";
import {
  getApplicantPortfolioAction,
  type ApplicantPortfolio,
} from "@/app/actions/applicant-portfolio";
import { setSettlementAmountAction } from "@/app/actions/settlements";
import { setApplicationConfirmedAction } from "@/app/actions/evaluations";
import { calcSettlement, formatWon, formatWonInput } from "@/lib/settlement";
import { EvaluationPanel } from "@/components/project/EvaluationPanel";

export type SheetApplicant = {
  applicationId: string;
  dancerId: string | null;
  name: string;
  status: string;
  publicHref: string | null;
  rejectionReason: string | null;
  confirmedAt: string | null;
};

const SOCIAL_KEYS = ["instagram", "youtube", "tiktok", "twitter", "x"] as const;

function socialUrl(platform: string, raw: string): string {
  const v = raw.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${h}`;
    case "youtube":
      return `https://www.youtube.com/@${h}`;
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "twitter":
    case "x":
      return `https://x.com/${h}`;
    default:
      return v;
  }
}

// 인라인 SVG (lucide 브랜드 아이콘은 상표 이슈로 제거됨)
function SettlementField({
  projectId,
  dancerId,
  initialAmount,
  status,
}: {
  projectId: string;
  dancerId: string;
  initialAmount: number | null;
  status: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [value, setValue] = useState(formatWonInput(initialAmount));
  const locked = status === "paid";
  const num = Number(value.replace(/[,\s]/g, ""));
  const preview = Number.isFinite(num) && num > 0 ? calcSettlement(num) : null;

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", dancerId);
    fd.set("gross_amount", value);
    startTransition(async () => {
      const res = await setSettlementAmountAction(fd);
      if (res.ok) {
        toast.success("정산금액을 저장했어요.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        정산금액 (세전, 원)
      </p>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(formatWonInput(e.target.value))}
          placeholder="예: 400,000"
          disabled={locked || busy}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={save}
          disabled={locked || busy || !value.trim()}
          className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
      {preview ? (
        <p className="text-[11px] text-ink-3">
          원천징수 3.3% −{formatWon(preview.tax)} · 실수령 {formatWon(preview.net)}
        </p>
      ) : null}
      {locked ? (
        <p className="text-[11px] text-ink-3">입금완료된 건은 수정할 수 없어요.</p>
      ) : null}
    </div>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;
  if (platform === "instagram") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15V9l5 3z" />
      </svg>
    );
  }
  // tiktok / 기타 → 음표 글리프
  return (
    <svg {...common} fill="currentColor">
      <path d="M14 4c.3 2 1.7 3.6 3.8 3.9v2.2c-1.4 0-2.7-.4-3.8-1.1v5.5a4.6 4.6 0 1 1-4.6-4.6c.3 0 .5 0 .8.1v2.3a2.3 2.3 0 1 0 1.6 2.2V4H14z" />
    </svg>
  );
}

export function ApplicantPortfolioSheet({
  open,
  onOpenChange,
  projectId,
  applicant,
  onDecide,
  deciding,
  canDecide = true,
  onMyScoreChange,
  onConfirmChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  applicant: SheetApplicant | null;
  onDecide: (decision: "accepted" | "rejected" | "pending") => void;
  deciding: boolean;
  canDecide?: boolean;
  onMyScoreChange?: (score: number | null) => void;
  onConfirmChange?: (confirmedAt: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApplicantPortfolio | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dancerId = applicant?.dancerId ?? null;

  async function toggleConfirm() {
    if (!applicant) return;
    const next = !applicant.confirmedAt;
    setConfirming(true);
    const fd = new FormData();
    fd.set("application_id", applicant.applicationId);
    fd.set("confirmed", next ? "1" : "0");
    const r = await setApplicationConfirmedAction(fd);
    setConfirming(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(next ? "확정했습니다" : "확정을 해제했습니다");
    onConfirmChange?.(next ? new Date().toISOString() : null);
  }

  useEffect(() => {
    if (!open || !dancerId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getApplicantPortfolioAction(projectId, dancerId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setData(r.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, dancerId, projectId]);

  const d = data?.dancer ?? null;
  const genreSet = new Set((d?.genres ?? []).map((g) => g.trim().toLowerCase()));
  const extraSpecialties = (d?.specialties ?? []).filter(
    (s) => !genreSet.has(s.trim().toLowerCase()),
  );
  const chips = [
    d?.gender,
    d?.location,
    ...(d?.genres ?? []),
    ...extraSpecialties,
  ].filter(Boolean) as string[];
  const decided =
    applicant?.status === "accepted" || applicant?.status === "rejected";
  const videos = (data?.careers ?? []).filter((c) => c.link);
  const otherCareers = (data?.careers ?? []).filter((c) => !c.link);
  const social = (d?.social_links ?? {}) as Record<string, string>;
  const socialEntries = SOCIAL_KEYS.map(
    (k) => [k, social[k]] as [string, string | undefined],
  ).filter(([, v]) => typeof v === "string" && v.trim().length > 0) as [
    string,
    string,
  ][];
  const heightCm = data?.height_cm ?? null;
  const shoeMm = data?.shoe_size_mm ?? null;
  const cEmail = data?.contactEmail ?? null;
  const cPhone = data?.contactPhone ?? null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={applicant?.name ?? "지원자"}
    >
      <div className="flex flex-col gap-5">
        {/* 헤더: 사진 + 이름 + 칩 */}
        <div className="flex items-start gap-3">
          {applicant && d?.profile_img ? (
            <Image
              src={d.profile_img}
              alt={applicant.name}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-secondary text-xl font-bold">
              {applicant?.name?.[0] ?? "?"}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-base font-bold leading-tight">
              {applicant?.name}
              {d?.korean_name ? (
                <span className="ml-1.5 text-sm font-normal text-ink-3">
                  {d.korean_name}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {heightCm ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  키 {heightCm}cm
                </span>
              ) : null}
              {shoeMm ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  신발 {shoeMm}mm
                </span>
              ) : null}
              {chips.slice(0, 8).map((c, i) => (
                <span
                  key={i}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-ink-2"
                >
                  {c}
                </span>
              ))}
            </div>
            {socialEntries.length > 0 ? (
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {socialEntries.map(([platform, raw]) => (
                  <a
                    key={platform}
                    href={socialUrl(platform, raw)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={platform}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-2 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <SocialIcon platform={platform} />
                  </a>
                ))}
              </div>
            ) : null}
            {applicant?.publicHref ? (
              <Link
                href={applicant.publicHref}
                className="mt-0.5 text-[11px] text-primary hover:underline"
              >
                전체 프로필 열기 →
              </Link>
            ) : null}
          </div>
        </div>

        {cEmail || cPhone ? (
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              연락처 (관리자 전용)
            </p>
            {cEmail ? (
              <p className="leading-relaxed">
                <span className="text-ink-3">이메일 </span>
                <a href={`mailto:${cEmail}`} className="text-primary hover:underline">
                  {cEmail}
                </a>
              </p>
            ) : null}
            {cPhone ? (
              <p className="leading-relaxed">
                <span className="text-ink-3">전화 </span>
                <a href={`tel:${cPhone}`} className="text-primary hover:underline">
                  {cPhone}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        {applicant?.status === "rejected" && applicant.rejectionReason ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            거절 사유: {applicant.rejectionReason}
          </p>
        ) : null}

        {d?.bio ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
            {d.bio}
          </p>
        ) : null}

        {d?.portfolio_file_url ? (
          <a
            href={d.portfolio_file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm font-medium hover:bg-secondary"
          >
            📄 포트폴리오 파일 {d.portfolio_file_name ? `· ${d.portfolio_file_name}` : ""}
            <span className="ml-auto text-primary">열기 →</span>
          </a>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-ink-3">
            포트폴리오 불러오는 중…
          </p>
        ) : error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : (
          <>
            {videos.length > 0 ? (
              <section className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
                  ↳ 영상 ({videos.length})
                </p>
                {videos.slice(0, 6).map((c) => (
                  <div key={c.id} className="flex flex-col gap-1">
                    <VideoEmbed url={c.link} title={c.title ?? undefined} />
                    {c.title ? (
                      <p className="text-xs text-ink-2">
                        {c.is_representative ? "★ " : ""}
                        {c.title}
                        {c.date ? (
                          <span className="text-ink-3"> · {c.date.slice(0, 7)}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

            {otherCareers.length > 0 ? (
              <section className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
                  ↳ 경력 ({otherCareers.length})
                </p>
                <ul className="flex flex-col gap-1">
                  {otherCareers.slice(0, 30).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-secondary/30"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {c.is_representative ? "★ " : ""}
                        {c.title ?? "(제목 없음)"}
                        {c.type ? (
                          <span className="ml-1.5 text-[11px] text-ink-3">
                            {c.type}
                          </span>
                        ) : null}
                      </span>
                      {c.date ? (
                        <span className="shrink-0 text-[11px] text-ink-3">
                          {c.date.slice(0, 7)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!loading &&
            videos.length === 0 &&
            otherCareers.length === 0 &&
            !d?.portfolio_file_url ? (
              <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
                등록된 포트폴리오·경력이 없습니다.
              </p>
            ) : null}
          </>
        )}

        {/* 사전선별 점수 — 영상·경력 본 그 자리에서 바로 평가 + 남 의견 공유. */}
        {applicant && canDecide ? (
          <EvaluationPanel
            open={open}
            applicationId={applicant.applicationId}
            canScore={canDecide}
            onMyScoreChange={onMyScoreChange}
          />
        ) : null}

        {/* 정산금액 — 수락된 지원자에게만. 사람을 보는 자리에서 바로 입력. */}
        {applicant?.status === "accepted" && dancerId ? (
          <SettlementField
            projectId={projectId}
            dancerId={dancerId}
            initialAmount={data?.settlement?.gross_amount ?? null}
            status={data?.settlement?.status ?? null}
          />
        ) : null}

        {/* 확정 — 수락한 지원자만. status 위에 얹는 최종 잠금(캐스팅보드·정산 기준). */}
        {applicant && canDecide && applicant.status === "accepted" ? (
          applicant.confirmedAt ? (
            <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
              <span className="text-sm font-semibold text-primary">✓ 확정됨</span>
              <button
                type="button"
                onClick={toggleConfirm}
                disabled={confirming}
                className="text-[12px] text-ink-3 underline hover:text-foreground disabled:opacity-50"
              >
                확정 해제
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-primary/50 text-primary"
              disabled={confirming}
              onClick={toggleConfirm}
            >
              이 지원자 확정하기
            </Button>
          )
        ) : null}

        {/* 결정 버튼 — 시트 콘텐츠 흐름에 포함(시트 전체가 스크롤되도록 sticky 제거) */}
        {applicant && canDecide ? (
          <div className="mt-1 flex gap-2 border-t border-hairline-2 pt-4">
            <Button
              className="flex-1"
              disabled={deciding}
              onClick={() => onDecide("accepted")}
            >
              수락
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={deciding}
              onClick={() => onDecide("rejected")}
            >
              거절
            </Button>
            {decided ? (
              <Button
                variant="ghost"
                disabled={deciding}
                onClick={() => onDecide("pending")}
              >
                대기로
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

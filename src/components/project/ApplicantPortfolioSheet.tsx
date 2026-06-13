"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { VideoEmbed } from "@/components/portfolio/VideoEmbed";
import {
  getApplicantPortfolioAction,
  type ApplicantPortfolio,
} from "@/app/actions/applicant-portfolio";

export type SheetApplicant = {
  applicationId: string;
  dancerId: string | null;
  name: string;
  status: string;
  publicHref: string | null;
};

export function ApplicantPortfolioSheet({
  open,
  onOpenChange,
  projectId,
  applicant,
  onDecide,
  deciding,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  applicant: SheetApplicant | null;
  onDecide: (decision: "accepted" | "rejected" | "pending") => void;
  deciding: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApplicantPortfolio | null>(null);

  const dancerId = applicant?.dancerId ?? null;

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
      setData(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, dancerId, projectId]);

  const d = data?.dancer ?? null;
  const chips = [
    d?.gender,
    d?.location,
    ...(d?.genres ?? []),
    ...(d?.specialties ?? []),
  ].filter(Boolean) as string[];
  const decided =
    applicant?.status === "accepted" || applicant?.status === "rejected";
  const videos = (data?.careers ?? []).filter((c) => c.link);
  const otherCareers = (data?.careers ?? []).filter((c) => !c.link);

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
            {chips.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {chips.slice(0, 8).map((c, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-ink-2"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
            {applicant?.publicHref ? (
              <Link
                href={applicant.publicHref}
                target="_blank"
                className="mt-0.5 text-[11px] text-primary hover:underline"
              >
                전체 프로필 열기 →
              </Link>
            ) : null}
          </div>
        </div>

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
      </div>

      {/* 결정 버튼 (시트 안에서 바로 처리) */}
      {applicant ? (
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex gap-2 border-t border-hairline-2 bg-card px-6 py-3">
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
    </BottomSheet>
  );
}

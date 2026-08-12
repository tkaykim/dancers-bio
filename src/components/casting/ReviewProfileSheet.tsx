"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { VideoEmbed } from "@/components/portfolio/VideoEmbed";
import { getCastingReviewProfileAction } from "@/app/actions/casting-review";
import type {
  BoardCard,
  CastingReviewProfile,
} from "@/lib/casting/board-data";

const SOCIAL_KEYS = ["instagram", "youtube", "tiktok", "twitter", "x"];

function socialUrl(platform: string, raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, "");
  if (platform === "instagram") return `https://instagram.com/${handle}`;
  if (platform === "youtube") return `https://www.youtube.com/@${handle}`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  return `https://x.com/${handle}`;
}

function platformLabel(platform: string): string {
  if (platform === "instagram") return "Instagram";
  if (platform === "youtube") return "YouTube";
  if (platform === "tiktok") return "TikTok";
  return "X";
}

export function ReviewProfileSheet({
  open,
  onOpenChange,
  reviewToken,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewToken: string;
  card: BoardCard | null;
}) {
  const [loaded, setLoaded] = useState<{
    memberId: string;
    profile: CastingReviewProfile | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    getCastingReviewProfileAction(reviewToken, card.memberId).then((result) => {
      if (cancelled) return;
      setLoaded({
        memberId: card.memberId,
        profile: result.ok ? (result.data ?? null) : null,
        error: result.ok ? null : result.error,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, card, reviewToken]);

  const current = card && loaded?.memberId === card.memberId ? loaded : null;
  const loading = Boolean(open && card && !current);
  const error = current?.error ?? null;
  const profile = current?.profile ?? null;

  const genreSet = new Set(
    (profile?.genres ?? []).map((genre) => genre.trim().toLowerCase()),
  );
  const chips = [
    profile?.gender,
    profile?.location,
    ...(profile?.genres ?? []),
    ...(profile?.specialties ?? []).filter(
      (specialty) => !genreSet.has(specialty.trim().toLowerCase()),
    ),
  ].filter(Boolean) as string[];
  const socialEntries = SOCIAL_KEYS.map(
    (platform) => [platform, profile?.socialLinks[platform]] as const,
  ).filter((entry): entry is readonly [string, string] => Boolean(entry[1]?.trim()));
  const videos = (profile?.careers ?? []).filter((career) => career.link);
  const careers = (profile?.careers ?? []).filter((career) => !career.link);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${card?.name ?? "지원자"} · deetz 프로필`}
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-ink-3">
          deetz 프로필을 불러오는 중…
        </p>
      ) : error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : profile ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            {profile.photo ? (
              <Image
                src={profile.photo}
                alt={profile.name}
                width={80}
                height={80}
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl font-bold">
                {profile.name[0] ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight">
                {profile.name}
                {profile.koreanName && profile.koreanName !== profile.name ? (
                  <span className="ml-1.5 text-sm font-normal text-ink-3">
                    {profile.koreanName}
                  </span>
                ) : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {card?.birthYear ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {card.birthYear}년생
                  </span>
                ) : null}
                {card?.height ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    키 {card.height}cm
                  </span>
                ) : null}
                {chips.slice(0, 10).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-ink-2"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {socialEntries.length ? (
            <div className="flex flex-wrap gap-2">
              {socialEntries.map(([platform, raw]) => (
                <a
                  key={platform}
                  href={socialUrl(platform, raw)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-secondary"
                >
                  {platformLabel(platform)} ↗
                </a>
              ))}
            </div>
          ) : null}

          {profile.bio ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
              {profile.bio}
            </p>
          ) : null}

          {profile.portfolioFileUrl ? (
            <a
              href={profile.portfolioFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <span>
                deetz 등록 포트폴리오
                {profile.portfolioFileName ? ` · ${profile.portfolioFileName}` : ""}
              </span>
              <span className="text-primary">열기 →</span>
            </a>
          ) : null}

          {videos.length ? (
            <section className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
                deetz 등록 영상 ({videos.length})
              </p>
              {videos.slice(0, 6).map((video) => (
                <div key={video.id} className="flex flex-col gap-1">
                  <VideoEmbed url={video.link!} title={video.title ?? undefined} />
                  {video.title ? (
                    <p className="text-xs text-ink-2">
                      {video.isRepresentative ? "★ " : ""}
                      {video.title}
                      {video.date ? (
                        <span className="text-ink-3"> · {video.date.slice(0, 7)}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {careers.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
                deetz 등록 경력 ({careers.length})
              </p>
              <ul className="flex flex-col gap-1">
                {careers.slice(0, 30).map((career) => (
                  <li
                    key={career.id}
                    className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-secondary/30"
                  >
                    <span className="min-w-0 flex-1">
                      {career.isRepresentative ? "★ " : ""}
                      {career.title ?? "(제목 없음)"}
                      {career.type ? (
                        <span className="ml-1.5 text-[11px] text-ink-3">
                          {career.type}
                        </span>
                      ) : null}
                    </span>
                    {career.date ? (
                      <span className="shrink-0 text-[11px] text-ink-3">
                        {career.date.slice(0, 7)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!videos.length && !careers.length && !profile.portfolioFileUrl ? (
            <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
              deetz에 등록된 영상·경력·포트폴리오 파일이 없습니다.
            </p>
          ) : null}

          {profile.slug ? (
            <a
              href={`https://dancers.bio/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-xs font-medium text-primary hover:underline"
            >
              공개 deetz 프로필 전체 화면으로 열기 ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

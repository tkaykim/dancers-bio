"use client";

import { useState } from "react";
import { parseVideoUrl } from "@/lib/utils/video";
import { VideoThumbnail, VideoEmbed } from "@/components/portfolio/VideoEmbed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Career = {
  id: string | number;
  type: string;
  title: string;
  date: string;
  is_representative: boolean | null;
  details: {
    role?: string;
    description?: string;
    link?: string;
    thumbnail?: string;
  } | null;
};

const COLLAPSE_THRESHOLD = 4;

function safeExternalUrl(input: string | null | undefined): string | null {
  const value = input?.trim() ?? "";
  return /^https?:\/\//i.test(value) ? value : null;
}

export function CareerGroup({
  label,
  items,
  variant = "card",
}: {
  label: string;
  items: Career[];
  variant?: "card" | "row" | "carousel";
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Career | null>(null);

  // 대표 경력: Spotify의 Popular처럼 한눈에 훑는 순위형 목록으로 전부 노출한다.
  // 좁은 카드 안에서 날짜와 배지가 글자 단위로 찢어지던 기존 카루셀을 대체한다.
  if (variant === "carousel") {
    return (
      <div>
        <h3 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
          {label}
          <span className="font-mono text-[11px] font-normal text-ink-2">
            {items.length}
          </span>
        </h3>
        <ol className="divide-y divide-hairline-2 border-y border-hairline-2">
          {items.map((c, index) => {
            const video = parseVideoUrl(c.details?.link);
            const year = c.date?.slice(0, 4) ?? "";
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="group grid min-h-20 w-full grid-cols-[2rem_3.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition-colors hover:bg-secondary/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:grid-cols-[2.5rem_4rem_minmax(0,1fr)_auto] sm:gap-4"
                >
                  <span className="font-mono text-xs tabular-nums text-ink-2">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="relative block aspect-square overflow-hidden rounded-md bg-surface-2">
                    {video ? (
                      <VideoThumbnail
                        url={video.url}
                        alt={c.title}
                        className="!size-full !rounded-none"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center font-mono text-[10px] font-semibold text-ink-2">
                        {year || "★"}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-sm font-semibold leading-snug sm:text-[15px]">
                      {c.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-2">
                      {c.details?.role || "대표 경력"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 pl-2">
                    <span className="hidden font-mono text-xs tabular-nums text-ink-2 sm:block">
                      {year}
                    </span>
                    <span className="flex size-9 items-center justify-center rounded-full border border-hairline-2 text-ink-2 transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
                      {video ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <span aria-hidden>›</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <CareerDetailDialog career={selected} onClose={() => setSelected(null)} />
      </div>
    );
  }

  const threshold = variant === "row" ? 6 : COLLAPSE_THRESHOLD;
  const overflow = items.length > threshold;
  const visible = expanded || !overflow ? items : items.slice(0, threshold);

  return (
    <div>
      <h3 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
        {label}
        <span className="font-mono text-[11px] font-normal text-ink-2">
          {items.length}
        </span>
      </h3>

      {variant === "row" ? (
        <ul className="divide-y divide-hairline-2 border-y border-hairline-2">
          {visible.map((c) => {
            const video = parseVideoUrl(c.details?.link);
            const year = c.date?.slice(0, 4) ?? "";
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="group flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-secondary/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  <span className="w-10 shrink-0 font-mono text-[11px] font-semibold tabular-nums text-ink-2">
                    {year}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">
                      {c.title}
                    </span>
                    {c.details?.role ? (
                      <span className="truncate text-xs text-ink-2">
                        {c.details.role}
                      </span>
                    ) : null}
                  </div>
                  {video ? (
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline-2 text-ink-2 transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background"
                      aria-hidden
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((c) => {
            const video = parseVideoUrl(c.details?.link);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
                >
                  {video ? (
                    <VideoThumbnail url={video.url} alt={c.title} />
                  ) : null}
                  <div className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
                    <span>{c.date}</span>
                    {c.is_representative ? (
                      <span className="text-primary">★ 대표</span>
                    ) : null}
                  </div>
                  <div className="text-sm font-medium leading-snug">
                    {c.title}
                  </div>
                  {c.details?.role ? (
                    <div className="text-xs text-ink-2">{c.details.role}</div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {overflow ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full border border-hairline-2 bg-card px-4 py-2 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary"
        >
          {expanded ? "접기" : `+ ${items.length - threshold}개 더 보기`}
        </button>
      ) : null}

      <CareerDetailDialog
        career={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function CareerDetailDialog({
  career,
  onClose,
}: {
  career: Career | null;
  onClose: () => void;
}) {
  const open = Boolean(career);
  const video = parseVideoUrl(career?.details?.link);
  const externalUrl = safeExternalUrl(career?.details?.link);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {career ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold leading-snug">
                {career.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
                <span>{career.date}</span>
                {career.is_representative ? (
                  <span className="text-primary">★ 대표</span>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            {video ? (
              <div className="mt-2">
                <VideoEmbed url={video.url} title={career.title} />
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-3 text-sm">
              {career.details?.role ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-2">
                    역할
                  </p>
                  <p className="mt-1 text-ink-2">{career.details.role}</p>
                </div>
              ) : null}
              {career.details?.description ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-2">
                    설명
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-2">
                    {career.details.description}
                  </p>
                </div>
              ) : null}
              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 self-start rounded-full border border-hairline-2 bg-card px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary"
                >
                  원본 링크 열기 ↗
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

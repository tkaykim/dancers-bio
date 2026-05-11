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

export function CareerGroup({
  label,
  items,
}: {
  label: string;
  items: Career[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Career | null>(null);
  const overflow = items.length > COLLAPSE_THRESHOLD;
  const visible =
    expanded || !overflow ? items : items.slice(0, COLLAPSE_THRESHOLD);

  return (
    <div>
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
        {label}
        <span className="font-mono text-[11px] font-normal text-ink-3">
          {items.length}
        </span>
      </h3>
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
                <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
                  <span>{c.date}</span>
                  {c.is_representative ? (
                    <span className="text-primary">★ 대표</span>
                  ) : null}
                </div>
                <div className="text-sm font-medium leading-snug">
                  {c.title}
                </div>
                {c.details?.role ? (
                  <div className="text-xs text-ink-3">{c.details.role}</div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {overflow ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 rounded-full border border-hairline-2 bg-card px-4 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary"
        >
          {expanded
            ? "접기"
            : `+ ${items.length - COLLAPSE_THRESHOLD}개 더 보기`}
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {career ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold leading-snug">
                {career.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
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
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-3">
                    역할
                  </p>
                  <p className="mt-1 text-ink-2">{career.details.role}</p>
                </div>
              ) : null}
              {career.details?.description ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-3">
                    설명
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-2">
                    {career.details.description}
                  </p>
                </div>
              ) : null}
              {career.details?.link ? (
                <a
                  href={career.details.link}
                  target="_blank"
                  rel="noopener"
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

"use client";

import { useState } from "react";
import { parseVideoUrl } from "@/lib/utils/video";
import { VideoEmbed } from "@/components/portfolio/VideoEmbed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type GalleryItem = { url: string; type?: string; thumbnail?: string };

/**
 * 매거진형 릴/사진 갤러리 — 포스터 카드, 좌우 스냅 스크롤, 다음 카드 peek.
 * 카드 클릭 시 외부로 튕기지 않고 인라인 모달로 재생/확대(영상=임베드, 사진=라이트박스).
 * variant: reel(3:4) | photo(4:5, 더 큼). 댄서·팀 공개 페이지 공유.
 */
export function ProfileGallery({
  items,
  altBase,
  variant = "reel",
}: {
  items: GalleryItem[];
  altBase: string;
  variant?: "reel" | "photo";
}) {
  const [active, setActive] = useState<
    | { kind: "video"; url: string }
    | { kind: "image"; url: string }
    | null
  >(null);

  if (items.length === 0) return null;

  const sizeCls =
    variant === "photo"
      ? "w-[80%] max-w-[320px] aspect-[4/5]"
      : "w-[68%] max-w-[280px] aspect-[3/4]";

  return (
    <>
      <div className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-1">
        {items.map((item, i) => {
          const isImage =
            item.type === "photo" ||
            /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(item.url);
          const video = isImage ? null : parseVideoUrl(item.url);
          const thumb = isImage
            ? item.url
            : video?.thumbnail_url ?? item.thumbnail ?? null;
          return (
            <button
              key={i}
              type="button"
              onClick={() =>
                setActive(
                  isImage
                    ? { kind: "image", url: item.url }
                    : { kind: "video", url: video?.url ?? item.url },
                )
              }
              className={`group relative block shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-2 text-left ring-1 ring-hairline-2 ${sizeCls}`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={`${altBase} ${i + 1}`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">
                  영상
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur">
                {String(i + 1).padStart(2, "0")}
              </span>
              {!isImage ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-black shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{altBase}</DialogTitle>
          </DialogHeader>
          {active?.kind === "video" ? (
            <VideoEmbed url={active.url} title={altBase} />
          ) : null}
          {active?.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url}
              alt={altBase}
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

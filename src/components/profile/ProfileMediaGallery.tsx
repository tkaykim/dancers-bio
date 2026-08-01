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

type MediaItem = {
  url: string;
  thumbnail?: string;
  type?: string;
};

type ActiveMedia =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | null;

function isImage(item: MediaItem): boolean {
  return (
    item.type === "photo" ||
    /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(item.url)
  );
}

function safeExternalUrl(input: string): string | null {
  const value = input.trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

export function ProfileMediaGallery({
  items,
  name,
  variant,
}: {
  items: MediaItem[];
  name: string;
  variant: "photos" | "videos";
}) {
  const [active, setActive] = useState<ActiveMedia>(null);

  if (items.length === 0) return null;

  const isVideoGallery = variant === "videos";

  return (
    <>
      <div
        className={
          "scrollbar-none -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:px-0 " +
          (isVideoGallery
            ? "sm:grid-cols-2"
            : "sm:grid-cols-2 lg:grid-cols-3")
        }
      >
        {items.map((item, index) => {
          const imageItem = isImage(item);
          const video = imageItem ? null : parseVideoUrl(item.url);
          const thumbnail = imageItem
            ? item.url
            : video?.thumbnail_url ?? item.thumbnail ?? null;
          const externalItem = !imageItem && !video;
          const externalUrl = externalItem ? safeExternalUrl(item.url) : null;
          const mediaClassName =
            "group relative shrink-0 snap-start overflow-hidden bg-[#171612] text-left ring-1 ring-black/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground " +
            (isVideoGallery
              ? "aspect-video w-[84vw] max-w-[620px] rounded-xl sm:w-auto"
              : "aspect-[4/5] w-[72vw] max-w-[330px] rounded-2xl sm:w-auto");
          const mediaContent = (
            <>
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnail}
                  alt={`${name} ${imageItem ? "photo" : "reel"} ${index + 1}`}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-white/55">
                  {externalItem ? "외부 미디어" : "영상"}
                </span>
              )}

              <span
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/58 via-transparent to-black/10"
                aria-hidden
              />
              <span className="absolute bottom-3 left-3 font-mono text-[11px] font-semibold text-white/78">
                {String(index + 1).padStart(2, "0")}
              </span>

              {video || externalUrl ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 ease-out group-hover:scale-105">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill={video ? "currentColor" : "none"}
                      stroke={externalItem ? "currentColor" : "none"}
                      strokeWidth="2"
                      aria-hidden
                    >
                      {video ? (
                        <path d="M8 5v14l11-7z" />
                      ) : (
                        <path d="M7 17 17 7M8 7h9v9" />
                      )}
                    </svg>
                  </span>
                </span>
              ) : null}
            </>
          );

          if (externalUrl) {
            return (
              <a
                key={`${item.url}-${index}`}
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={mediaClassName}
                aria-label={`${name} 외부 미디어 ${index + 1} 새 창에서 열기`}
              >
                {mediaContent}
              </a>
            );
          }

          if (externalItem) {
            return (
              <div
                key={`${item.url}-${index}`}
                className={mediaClassName}
                aria-label={`${name} 미디어 ${index + 1}을 열 수 없음`}
              >
                {mediaContent}
              </div>
            );
          }

          return (
            <button
              key={`${item.url}-${index}`}
              type="button"
              onClick={() =>
                setActive(
                  imageItem
                    ? { kind: "image", url: item.url }
                    : { kind: "video", url: video?.url ?? item.url },
                )
              }
              className={mediaClassName}
              aria-label={`${name} ${imageItem ? "사진" : "영상"} ${index + 1} 크게 보기`}
            >
              {mediaContent}
            </button>
          );
        })}
      </div>

      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden border-0 bg-[#11100e] p-2 text-white [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-black/55 [&_[data-slot=dialog-close]]:hover:bg-black/75 sm:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{name} 포트폴리오 미디어</DialogTitle>
          </DialogHeader>
          {active?.kind === "video" ? (
            <VideoEmbed
              url={active.url}
              title={`${name} portfolio video`}
              className="!rounded-xl"
            />
          ) : null}
          {active?.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url}
              alt={`${name} portfolio`}
              className="max-h-[86vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

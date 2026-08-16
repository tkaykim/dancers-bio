"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

// 사진을 눌러 크게 보고 넘기는 뷰어.
//
// 옵션별로 나뉜 격자를 하나의 평평한 목록으로 이어서, A 마지막에서 다음을 누르면 B 로 넘어간다.
// 대신 어느 옵션 사진인지 헤더에 계속 보여줘 맥락을 잃지 않게 한다.

export type ViewerPhoto = { id: string; url: string; caption: string | null; groupLabel: string };

/** 스와이프로 인정할 최소 가로 이동(px). 세로 스크롤과 헷갈리지 않을 만큼만 준다. */
const SWIPE_THRESHOLD = 50;

export function VillagePhotoViewer({
  photos,
  index,
  onClose,
  onIndexChange,
  closeLabel,
  prevLabel,
  nextLabel,
}: {
  photos: ViewerPhoto[];
  /** null 이면 닫힌 상태 */
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const open = index !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);

  const go = useCallback(
    (delta: number) => {
      if (index === null || photos.length === 0) return;
      // 끝에서 반대편으로 순환한다 — 마지막 사진에서 막히면 넘기다 말게 된다.
      onIndexChange((index + delta + photos.length) % photos.length);
    },
    [index, photos.length, onIndexChange],
  );

  // 키보드: ← → 이동, ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose]);

  // 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || index === null) return null;
  const photo = photos[index];
  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? photo.groupLabel}
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchMove={(e) => {
        if (!touchStart.current) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStart.current.x;
        const dy = t.clientY - touchStart.current.y;
        // 세로로 크게 움직이면 스와이프로 보지 않는다.
        if (Math.abs(dx) > Math.abs(dy)) setDragX(dx);
      }}
      onTouchEnd={() => {
        if (Math.abs(dragX) > SWIPE_THRESHOLD) go(dragX < 0 ? 1 : -1);
        setDragX(0);
        touchStart.current = null;
      }}
    >
      {/* 헤더: 어느 옵션인지 + 현재 위치 + 닫기 */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white/90">{photo.groupLabel}</p>
          <p className="text-[11px] tabular-nums text-white/50">
            {index + 1} / {photos.length}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label={closeLabel}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* 사진 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption ?? photo.groupLabel}
          onClick={(e) => e.stopPropagation()}
          style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
          className="max-h-full max-w-full select-none rounded-lg object-contain"
        />

        {photos.length > 1 ? (
          <>
            <NavButton side="left" label={prevLabel} onClick={() => go(-1)} />
            <NavButton side="right" label={nextLabel} onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {photo.caption ? (
        <p className="shrink-0 px-4 pb-4 text-center text-[13px] text-white/70">{photo.caption}</p>
      ) : null}
    </div>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </button>
  );
}

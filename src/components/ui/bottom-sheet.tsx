"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
  footer?: React.ReactNode;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  contentClassName,
  style,
  footer,
}: BottomSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Popup
          style={style}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col bg-card text-card-foreground shadow-2xl outline-none",
            "rounded-t-2xl border-t border-hairline-2",
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[500px] sm:max-w-[calc(100%-2rem)] sm:rounded-2xl sm:border",
            "data-open:animate-in data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:slide-out-to-bottom-full",
            "sm:data-open:slide-in-from-bottom-4 sm:data-open:fade-in-0 sm:data-closed:slide-out-to-bottom-4 sm:data-closed:fade-out-0",
            "duration-300",
            className,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline-2 px-4 py-2 sm:px-6 sm:py-3">
            {title ? (
              <DialogPrimitive.Title title={title} className="min-w-0 flex-1 line-clamp-2 break-keep [overflow-wrap:anywhere] text-base font-bold text-foreground">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <span />
            )}
            <DialogPrimitive.Close
              aria-label="닫기"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div data-sheet-content className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain break-keep p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [overflow-wrap:anywhere] sm:p-6", contentClassName)}>{children}</div>
          {footer ? <div data-sheet-footer className="shrink-0 border-t border-hairline-2 bg-card px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-6">{footer}</div> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

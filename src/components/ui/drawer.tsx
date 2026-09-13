"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import ui from "@/lib/i18n/messages/ui";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

// 모바일: 바텀시트 / 데스크톱(sm+): 우측 사이드 드로어.
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  className,
  contentClassName,
}: DrawerProps) {
  const t = useT(ui);
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
          className={cn(
            // mobile: bottom sheet
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] w-full flex-col bg-card text-card-foreground shadow-2xl outline-none",
            "rounded-t-2xl border-t border-hairline-2",
            "data-open:animate-in data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:slide-out-to-bottom-full",
            // desktop: right-side drawer
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:top-0 sm:h-full sm:max-h-none sm:w-[440px] sm:max-w-[calc(100%-2rem)] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0",
            "sm:data-open:slide-in-from-right-full sm:data-closed:slide-out-to-right-full",
            "duration-300",
            className,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline-2 px-4 py-3 sm:px-6 sm:py-4">
            {title ? (
              <DialogPrimitive.Title className="min-w-0 break-words text-base font-bold text-foreground [overflow-wrap:anywhere]">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <span />
            )}
            <DialogPrimitive.Close
              aria-label={t("drawer.close")}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-6", contentClassName)}>{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

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
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
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
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] w-full flex-col bg-card text-card-foreground shadow-2xl outline-none",
            "rounded-t-2xl border-t border-hairline-2",
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[500px] sm:max-w-[calc(100%-2rem)] sm:rounded-2xl sm:border",
            "data-open:animate-in data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:slide-out-to-bottom-full",
            "sm:data-open:slide-in-from-bottom-4 sm:data-open:fade-in-0 sm:data-closed:slide-out-to-bottom-4 sm:data-closed:fade-out-0",
            "duration-300",
            className,
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-hairline-2 px-6 py-4">
            {title ? (
              <DialogPrimitive.Title className="text-base font-bold text-foreground">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <span />
            )}
            <DialogPrimitive.Close
              aria-label="닫기"
              className="-mr-2 rounded-full p-2 text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

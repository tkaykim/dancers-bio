"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PortfolioImportSheet } from "./PortfolioImportSheet";

/**
 * CTA card + modal trigger for the AI portfolio import flow on the
 * `/me/portfolio/[dancerId]/careers` page. Attaches careers directly
 * to the given dancer; skips the profile-summary review block.
 */
export function ImportEntryButton({
  profileId,
  dancerId,
}: {
  profileId: string;
  dancerId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles size={18} />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold">AI로 포트폴리오 일괄 추가</p>
          <p className="text-xs text-ink-3">
            PDF나 텍스트를 첨부하면 경력을 자동으로 정리해 드려요.
          </p>
        </div>
      </button>
      <PortfolioImportSheet
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        dancerId={dancerId}
        showProfileReview={false}
      />
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { Sparkles, Upload, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect } from "react";
import { usePortfolioImport } from "./usePortfolioImport";
import { ImportReviewList } from "./ImportReviewList";
import type { ParsedPortfolio } from "@/lib/ai/portfolio-extractor";
import { useT, useLocale } from "@/lib/i18n/provider";
import { formatNumber } from "@/lib/i18n/t";
import portfolio from "@/lib/i18n/messages/portfolio";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner profile id (Supabase Storage bucket prefix). */
  profileId: string;
  /** Existing dancer id to attach careers to. Pass null when used as a pure parser (onboarding flow). */
  dancerId: string | null;
  /** Show profile summary in review (true for onboarding-style review with dancerId, false for existing dancer). */
  showProfileReview: boolean;
  /** When provided, the sheet skips the in-modal review stage and hands the parsed result to the caller (used by onboarding wizard to prefill its own state). */
  onParsed?: (result: ParsedPortfolio) => void;
  /** Callback after at least one career is saved (or user closes after review). */
  onCompleted?: () => void;
};

export function PortfolioImportSheet({
  open,
  onOpenChange,
  profileId,
  dancerId,
  showProfileReview,
  onParsed,
  onCompleted,
}: Props) {
  const t = useT(portfolio);
  const locale = useLocale();
  const [tab, setTab] = useState<"pdf" | "text">("pdf");
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importer = usePortfolioImport(profileId);

  // External-handoff mode: skip the in-modal review and pass the parsed
  // result to the caller (used by the onboarding wizard to prefill state).
  useEffect(() => {
    if (importer.phase === "review" && importer.result && onParsed) {
      onParsed(importer.result);
      importer.reset();
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importer.phase]);

  function close() {
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      importer.reset();
      setText("");
      if (fileRef.current) fileRef.current.value = "";
    }, 250);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importer.submitPdf(file);
  }

  function handleTextSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    importer.submitText(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : onOpenChange(o))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles size={16} className="text-primary" />
            {t("import.sheet_title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("import.sheet_desc")}
          </DialogDescription>
        </DialogHeader>

        {importer.phase === "idle" ? (
          <>
            <div className="flex gap-1 rounded-full border border-border bg-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setTab("pdf")}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors " +
                  (tab === "pdf"
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-3")
                }
              >
                <Upload size={12} /> PDF
              </button>
              <button
                type="button"
                onClick={() => setTab("text")}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors " +
                  (tab === "text"
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-3")
                }
              >
                <FileText size={12} /> {t("import.tab_text")}
              </button>
            </div>

            {tab === "pdf" ? (
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm transition-colors hover:bg-secondary">
                  <Upload size={20} className="text-ink-3" />
                  <span className="font-medium">{t("import.pdf_pick")}</span>
                  <span className="text-[11px] text-ink-3">
                    {t("import.pdf_limit")}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  maxLength={50000}
                  placeholder={t("import.text_placeholder")}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-ink-3">
                  {t("import.text_count", {
                    count: formatNumber(text.length, locale),
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleTextSubmit}
                  disabled={!text.trim()}
                  className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {t("import.analyze")}
                </button>
              </div>
            )}
          </>
        ) : null}

        {importer.phase === "uploading" || importer.phase === "analyzing" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-ink-2">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p>
              {importer.phase === "uploading"
                ? t("import.uploading")
                : t("import.analyzing")}
            </p>
          </div>
        ) : null}

        {importer.phase === "error" ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {importer.error}
            </div>
            <button
              type="button"
              onClick={importer.reset}
              className="self-end rounded-full border border-hairline-2 px-4 py-2 text-sm font-medium"
            >
              {t("import.retry")}
            </button>
          </div>
        ) : null}

        {importer.phase === "review" && importer.result ? (
          <ImportReviewList
            parsed={importer.result}
            dancerId={dancerId}
            showProfile={showProfileReview}
            onCancel={close}
            onDone={() => {
              onCompleted?.();
              close();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

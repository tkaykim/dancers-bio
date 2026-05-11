"use client";

import { useState, useTransition } from "react";
import { parsePortfolioAction } from "@/app/actions/portfolio-ai";
import { uploadPortfolioPdfFromBrowser } from "@/lib/storage/upload-portfolio-client";

export type ParsedPortfolioClient = Awaited<
  ReturnType<typeof parsePortfolioAction>
>;

export type ImportPhase =
  | "idle"
  | "uploading"
  | "analyzing"
  | "review"
  | "error";

export function usePortfolioImport(profileId: string) {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    Extract<ParsedPortfolioClient, { ok: true }>["data"] | null
  >(null);

  function reset() {
    setPhase("idle");
    setError(null);
    setResult(null);
  }

  async function submitPdf(file: File) {
    setError(null);
    setPhase("uploading");
    const upload = await uploadPortfolioPdfFromBrowser(file, profileId);
    if (!upload.ok) {
      setError(upload.error);
      setPhase("error");
      return;
    }
    setPhase("analyzing");
    startTransition(async () => {
      const res = await parsePortfolioAction({
        kind: "pdf",
        storagePath: upload.storagePath,
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setResult(res.data);
      setPhase("review");
    });
  }

  async function submitText(text: string) {
    setError(null);
    setPhase("analyzing");
    startTransition(async () => {
      const res = await parsePortfolioAction({ kind: "text", text });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setResult(res.data);
      setPhase("review");
    });
  }

  return {
    phase,
    pending,
    error,
    result,
    submitPdf,
    submitText,
    reset,
  };
}

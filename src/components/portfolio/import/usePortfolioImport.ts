"use client";
import { useEffect, useRef, useState } from "react";
import { parsePortfolioAction, getPortfolioImportAction, latestPortfolioImportAction, finishPortfolioImportAction } from "@/app/actions/portfolio-ai";
import { uploadPortfolioPdfFromBrowser } from "@/lib/storage/upload-portfolio-client";
import type { ParsedPortfolio } from "@/lib/portfolio-import/schema";

export type ImportPhase = "idle" | "uploading" | "analyzing" | "review" | "error";
export function usePortfolioImport(profileId: string) {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedPortfolio | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const generation = useRef(0);
  const request = useRef<{ id: string; input: { kind: "text"; text: string } | { kind: "pdf"; storagePath: string } } | null>(null);
  const key = `portfolio-import:${profileId}`;
  useEffect(() => {
    // Restore browser-only storage after hydration; cancel if the owner changes.
    let stopped = false;
    const run = generation.current;
    const timer = setTimeout(async () => {
      try {
        const saved = sessionStorage.getItem(key) || await latestPortfolioImportAction();
        if (saved && !stopped && run === generation.current) { setJobId(saved); setPhase("analyzing"); }
      } catch { /* Storage can be disabled. */ }
    }, 0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [key]);
  useEffect(() => {
    if (!jobId || phase !== "analyzing") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await getPortfolioImportAction(jobId!);
        if (stopped) return;
        if (!response.ok || !response.data) { setError(response.ok ? "IMPORT_FAILED" : response.error); setPhase("error"); return; }
        if (response.data.result) { setResult(response.data.result); setPhase("review"); return; }
        timer = setTimeout(poll, 4000);
      } catch {
        if (!stopped) { setError("IMPORT_CONNECTION"); setPhase("error"); }
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, phase]);

  function reset() {
    generation.current++;
    if (jobId) void finishPortfolioImportAction(jobId).catch(() => undefined);
    setPhase("idle"); setError(null); setResult(null); setJobId(null);
    request.current = null;
    try { sessionStorage.removeItem(key); } catch { /* optional */ }
  }
  function retry() {
    if (jobId && error === "IMPORT_CONNECTION") { setError(null); setPhase("analyzing"); }
    else if (request.current && error === "IMPORT_CONNECTION") {
      setError(null); setPhase("analyzing");
      void submit(request.current.input, generation.current).catch(() => { setError("IMPORT_CONNECTION"); setPhase("error"); });
    }
    else reset();
  }
  async function submit(input: { kind: "text"; text: string } | { kind: "pdf"; storagePath: string }, run: number) {
    request.current ??= { id: crypto.randomUUID(), input };
    const response = await parsePortfolioAction(input, request.current.id);
    if (run !== generation.current) return;
    if (!response.ok || !response.data) { setError(response.ok ? "IMPORT_FAILED" : response.error); setPhase("error"); return; }
    setJobId(response.data.jobId);
    try { sessionStorage.setItem(key, response.data.jobId); } catch { /* optional */ }
    setPhase("analyzing");
  }
  async function submitPdf(file: File) {
    const run = ++generation.current;
    request.current = null;
    setError(null); setPhase("uploading");
    try {
      const upload = await uploadPortfolioPdfFromBrowser(file, profileId);
      if (run !== generation.current) return;
      if (!upload.ok) { setError(upload.error); setPhase("error"); return; }
      await submit({ kind: "pdf", storagePath: upload.storagePath }, run);
    } catch { if (run === generation.current) { setError("IMPORT_CONNECTION"); setPhase("error"); } }
  }
  async function submitText(text: string) {
    const run = ++generation.current;
    request.current = null;
    setError(null); setPhase("analyzing");
    try { await submit({ kind: "text", text }, run); }
    catch { if (run === generation.current) { setError("IMPORT_CONNECTION"); setPhase("error"); } }
  }
  return { phase, pending: phase === "uploading" || phase === "analyzing", error, result, jobId, submitPdf, submitText, reset, retry };
}

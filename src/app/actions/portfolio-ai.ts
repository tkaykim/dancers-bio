"use server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { importInputSchema, parsedPortfolioSchema, type ParsedPortfolio } from "@/lib/portfolio-import/schema";
import { isValidPortfolioStoragePath } from "@/lib/storage/portfolio-uploads";
import type { ActionResult } from "./auth";

export async function parsePortfolioAction(input: unknown, requestId: string): Promise<ActionResult<{ jobId: string }>> {
  const profile = await requireProfile();
  if (process.env.PORTFOLIO_IMPORT_ENABLED !== "true") return { ok: false, error: "IMPORT_UNAVAILABLE" };
  const parsed = importInputSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(requestId).success) return { ok: false, error: "INVALID_IMPORT" };
  const source = parsed.data;
  if (source.kind === "pdf" && !isValidPortfolioStoragePath(source.storagePath, profile.id))
    return { ok: false, error: "INVALID_IMPORT" };
  const { data, error } = await createAdminClient().rpc("enqueue_portfolio_import", {
    p_profile: profile.id, p_request: requestId, p_kind: source.kind,
    p_text: source.kind === "text" ? source.text : null,
    p_path: source.kind === "pdf" ? source.storagePath : null,
  });
  if (error) return { ok: false, error: error.message.includes("IMPORT_RATE_LIMIT") ? "IMPORT_RATE_LIMIT" : "IMPORT_UNAVAILABLE" };
  return { ok: true, data: { jobId: data as string } };
}

export async function getPortfolioImportAction(jobId: string): Promise<ActionResult<{ status: string; result: ParsedPortfolio | null }>> {
  const profile = await requireProfile();
  if (!z.uuid().safeParse(jobId).success) return { ok: false, error: "INVALID_IMPORT" };
  const { data, error } = await createAdminClient().from("portfolio_import_jobs")
    .select("status,result").eq("id", jobId).eq("profile_id", profile.id).maybeSingle();
  if (error || !data) return { ok: false, error: "IMPORT_UNAVAILABLE" };
  if (data.status === "failed") return { ok: false, error: "IMPORT_FAILED" };
  const result = data.status === "ready" ? parsedPortfolioSchema.safeParse(data.result) : null;
  if (result && !result.success) return { ok: false, error: "IMPORT_FAILED" };
  return { ok: true, data: { status: data.status, result: result?.success ? result.data : null } };
}

export async function latestPortfolioImportAction(): Promise<string | null> {
  const profile = await requireProfile();
  const { data } = await createAdminClient().from("portfolio_import_jobs").select("id")
    .eq("profile_id", profile.id).is("reviewed_at", null).in("status", ["queued", "processing", "ready"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function finishPortfolioImportAction(jobId: string): Promise<void> {
  const profile = await requireProfile();
  if (!z.uuid().safeParse(jobId).success) return;
  await createAdminClient().from("portfolio_import_jobs").update({ reviewed_at: new Date().toISOString() })
    .eq("id", jobId).eq("profile_id", profile.id);
}

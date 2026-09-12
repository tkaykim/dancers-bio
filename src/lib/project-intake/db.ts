import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntakeResult } from "./schema";
// New isolated schema boundary; remove cast after the next full DB type generation.
export const intakeDb = () => createAdminClient() as unknown as SupabaseClient;
export type IntakeJob = {
  id: string;
  source_raw: string;
  languages: string[];
  private_terms: string[];
  hide_names: boolean;
  source_paths: string[];
  status: string;
  revision: number;
  error: string | null;
  source_urls?: Array<{ path: string; url?: string }>;
  created_at: string;
  result: IntakeResult | null;
  operator_notes: string;
  project_id: string | null;
  assets: Array<{
    language: string;
    path: string;
    index: number;
    url?: string;
  }>;
  studio_jobs: Record<string, string>;
  project_code?: string;
};

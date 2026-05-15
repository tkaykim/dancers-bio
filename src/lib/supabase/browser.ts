"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// PWA standalone에서 백그라운드 후 복귀 시 토큰 자동 갱신을 확실히 하기 위해
// persistSession/autoRefreshToken 명시.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}

let cached: ReturnType<typeof createClient> | null = null;
export function getBrowserClient() {
  if (typeof window === "undefined") return createClient();
  if (!cached) cached = createClient();
  return cached;
}

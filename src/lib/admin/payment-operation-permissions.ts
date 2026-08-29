import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function canExecutePaymentOperationsDirectly(
  userId: string,
  client: SupabaseClient = adminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("payment_operation_executors")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[payment-operation-permissions] direct executor lookup failed", {
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return Boolean(data);
}

import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getProjectApplicationScopeIds(
  admin: AdminClient,
  projectId: string,
): Promise<string[]> {
  const { data: channels } = await admin
    .from("recruitment_channels")
    .select("legacy_project_id")
    .eq("project_id", projectId)
    .not("legacy_project_id", "is", null);

  return Array.from(
    new Set([
      projectId,
      ...((channels ?? []) as Array<{ legacy_project_id: string | null }>)
        .map((channel) => channel.legacy_project_id)
        .filter((id): id is string => !!id),
    ]),
  );
}

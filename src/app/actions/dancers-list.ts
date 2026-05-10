"use server";

import { requireUser } from "@/lib/auth/guard";
import {
  DANCER_PAGE_SIZE,
  fetchDancerPage,
  type DancerListItem,
} from "@/lib/data/dancers";
import type { ActionResult } from "./auth";

export async function loadMoreDancersAction({
  q,
  offset,
}: {
  q: string;
  offset: number;
}): Promise<ActionResult<{ dancers: DancerListItem[]; hasMore: boolean }>> {
  // Auth guard mirrors the directory page's behavior — unauthenticated users
  // are redirected by `requireUser` from `/dancers`, so the action must too.
  await requireUser();

  if (!Number.isFinite(offset) || offset < 0 || offset > 5000) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const dancers = await fetchDancerPage({ q, offset });
  return {
    ok: true,
    data: {
      dancers,
      hasMore: dancers.length === DANCER_PAGE_SIZE,
    },
  };
}

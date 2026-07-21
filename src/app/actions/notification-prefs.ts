"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { updatePrefs } from "@/lib/notify/notification-preferences";
import type { ActionResult } from "./auth";

// 본인 알림/이메일 수신 설정 저장. /me/notifications 폼에서 호출.
export async function updateNotificationPrefsAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const bool = (k: string) => fd.get(k) === "true" || fd.get(k) === "on";
  try {
    await updatePrefs(user.id, {
      email_project_match: bool("email_project_match"),
      email_marketing: bool("email_marketing"),
      push_project_match: bool("push_project_match"),
      // 전체 수신거부는 별도 스위치 — 켜면 모든 마케팅/추천 메일 차단.
      email_unsubscribed_all: bool("email_unsubscribed_all"),
    });
    revalidatePath("/me/notifications");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

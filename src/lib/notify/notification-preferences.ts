import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 유저별 알림/이메일 수신 설정. 행이 없으면 = 전체 수신(기본값).
// 수신거부/설정 조회는 서비스롤(admin)로 처리 — 비로그인 수신거부 링크도 동작해야 하므로.

export interface NotificationPrefs {
  user_id: string;
  email_project_match: boolean;
  email_marketing: boolean;
  push_project_match: boolean;
  email_unsubscribed_all: boolean;
  unsubscribe_token: string;
}

export type NotificationPrefPatch = Partial<
  Pick<
    NotificationPrefs,
    | "email_project_match"
    | "email_marketing"
    | "push_project_match"
    | "email_unsubscribed_all"
  >
>;

const COLS =
  "user_id, email_project_match, email_marketing, push_project_match, email_unsubscribed_all, unsubscribe_token";

export async function getOrCreatePrefs(userId: string): Promise<NotificationPrefs> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_preferences")
    .select(COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as NotificationPrefs;

  // 없으면 기본값(전체 수신)으로 생성. 동시 생성 레이스는 upsert로 흡수.
  const { data: created, error } = await admin
    .from("notification_preferences")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: false })
    .select(COLS)
    .single();
  if (error || !created) throw new Error(error?.message ?? "prefs_create_failed");
  return created as NotificationPrefs;
}

export async function updatePrefs(
  userId: string,
  patch: NotificationPrefPatch,
): Promise<void> {
  const admin = createAdminClient();
  await getOrCreatePrefs(userId); // 행 보장
  const { error } = await admin
    .from("notification_preferences")
    .update(patch)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getPrefsByToken(
  token: string,
): Promise<NotificationPrefs | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_preferences")
    .select(COLS)
    .eq("unsubscribe_token", token)
    .maybeSingle();
  return (data as NotificationPrefs) ?? null;
}

// 원클릭 수신거부/재구독 — 토큰만으로(로그인 불필요) 전체 이메일 수신 여부를 토글.
export async function setUnsubscribeByToken(
  token: string,
  unsubscribed: boolean,
): Promise<NotificationPrefs | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .update({ email_unsubscribed_all: unsubscribed })
    .eq("unsubscribe_token", token)
    .select(COLS)
    .maybeSingle();
  if (error) return null;
  return (data as NotificationPrefs) ?? null;
}

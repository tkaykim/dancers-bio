import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToSubscriptions, type PushPayload } from "@/lib/push";

// public.notification_type enum (라이브 DB 기준).
export type NotificationType =
  | "application_received"
  | "application_accepted"
  | "application_rejected"
  | "application_withdrawn"
  | "direct_proposal_received"
  | "direct_proposal_accepted"
  | "direct_proposal_declined"
  | "creator_permission_granted"
  | "creator_permission_revoked"
  | "project_session_reminder"
  | "settlement_withdrawal_requested"
  | "announcement_posted"
  | "settlement_confirmed"
  | "settlement_paid"
  | "settlement_info_required"
  | "ops_access_requested"
  | "ops_access_granted"
  | "project_posted_match";

type NotifyParams = {
  recipientId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
  /** 전달 시 recipient의 모든 웹푸시 구독으로 발송. */
  push?: PushPayload;
};

/**
 * 알림 1건 생성: notifications 행 insert + (옵션) 웹푸시 발송.
 *
 * notifications 테이블엔 INSERT RLS 정책이 없으므로 service-role(admin client)로 기록한다.
 * 알림은 부가 기능이므로 **절대 throw하지 않는다** — 실패해도 호출한 서버 액션의
 * 핵심 흐름(제안 생성/응답 등)은 성공으로 끝나야 한다. service_role 키가 없는
 * 개발 환경에서도 조용히 무시된다.
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.from("notifications").insert({
      recipient_id: params.recipientId,
      type: params.type,
      payload: params.payload ?? {},
    });
    if (error) {
      console.error("[notify] notifications insert failed:", error.message);
    }

    if (params.push) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .eq("user_id", params.recipientId);
      if (subs && subs.length > 0) {
        await sendPushToSubscriptions(subs, params.push);
      }
    }
  } catch (err) {
    console.error("[notify] failed (non-fatal):", err);
  }
}

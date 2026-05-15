import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID 키가 설정되지 않았습니다 (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * 여러 구독에 푸시 발송. 만료된(410/404) 구독은 자동 삭제.
 * service_role 클라이언트가 있을 때만 만료 cleanup이 동작.
 */
export async function sendPushToSubscriptions(
  subs: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; total: number }> {
  configure();
  const json = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          json,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(s.endpoint);
        } else {
          console.error("[push] send failed:", status, err);
        }
        failed += 1;
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    try {
      const admin = createAdminClient();
      await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    } catch (err) {
      console.warn("[push] expired cleanup failed (service_role missing?)", err);
    }
  }

  return { sent, failed, total: subs.length };
}

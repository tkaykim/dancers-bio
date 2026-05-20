import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToSubscriptions } from "@/lib/push";

// 본인에게 'Hello' 테스트 푸시 발송. 본인 구독만 대상.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json(
      { error: "이 계정에 등록된 알림 구독이 없습니다. 먼저 알림 받기를 켜주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await sendPushToSubscriptions(subs, {
      title: "dancers.bio 테스트 알림",
      body: "Hello — 푸시 알림이 정상 동작합니다 🎉",
      url: "/me",
    });
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    console.error("[push/send-test]", err);
    const msg =
      err instanceof Error
        ? err.message
        : "VAPID 설정 또는 발송 중 오류가 발생했습니다.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

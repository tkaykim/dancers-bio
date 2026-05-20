import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  ua: z.string().max(500).optional(),
  oldEndpoint: z.string().url().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, supabase };
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserId();
    if (!auth) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { userId, supabase } = auth;

    const body = await request.json().catch(() => ({}));
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const { endpoint, keys, ua, oldEndpoint } = parsed.data;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        ua: ua ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("[push/subscribe POST]", error);
      return NextResponse.json({ error: "저장 실패" }, { status: 500 });
    }

    if (oldEndpoint && oldEndpoint !== endpoint) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", oldEndpoint);
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[push/subscribe POST] uncaught", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireUserId();
    if (!auth) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { userId, supabase } = auth;

    const body = await request.json().catch(() => ({}));
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", parsed.data.endpoint);
    if (error) {
      console.error("[push/subscribe DELETE]", error);
      return NextResponse.json({ error: "해제 실패" }, { status: 500 });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[push/subscribe DELETE] uncaught", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

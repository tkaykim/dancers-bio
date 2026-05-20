import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory throttle (best-effort per warm serverless instance).
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = ipBuckets.get(ip);
  if (!b || b.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return false;
  }
  if (b.count >= IP_MAX_PER_WINDOW) return true;
  b.count += 1;
  return false;
}

function classifyNoise(message: string): { isNoise: boolean; reason?: string } {
  if (!message) return { isNoise: true, reason: "empty" };
  if (/ResizeObserver loop/i.test(message)) return { isNoise: true, reason: "resize_observer" };
  if (/^Script error\.?$/i.test(message)) return { isNoise: true, reason: "cross_origin_script" };
  if (/Load failed/i.test(message) && message.length < 30) return { isNoise: true, reason: "load_failed_generic" };
  if (/Non-Error promise rejection captured/i.test(message)) return { isNoise: true, reason: "non_error_rejection" };
  return { isNoise: false };
}

interface LogErrorBody {
  message?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  source?: "client" | "global" | "server" | "api";
  context?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as LogErrorBody | null;
    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
    }

    const noise = classifyNoise(body.message);
    if (noise.isNoise) {
      return NextResponse.json({ ok: true, noise: noise.reason });
    }

    const message = body.message.slice(0, 500);
    const stack = body.stack?.slice(0, 4000) ?? null;
    const url = body.url?.slice(0, 2000) ?? null;
    const userAgent =
      body.userAgent?.slice(0, 500) ?? req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const source = body.source ?? "client";

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let role = "guest";
    if (user) {
      role = "user";
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (prof?.is_admin) role = "admin";
    }

    const title = `[자동] ${message}`.slice(0, 160);
    const description = [
      message,
      "",
      stack ? `--- Stack ---\n${stack}` : "",
      body.context ? `\n--- Context ---\n${JSON.stringify(body.context, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);

    // Dedup by message+url+source within 1h: if a row with same signature
    // and emailed_at within the last hour exists, just bump it instead of
    // creating a new row + spamming email.
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await supabase
      .from("bug_reports")
      .select("id, emailed_at")
      .eq("title", title)
      .eq("page_url", url)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      // Touch updated_at so admins see it bubble in lists. Do not re-email.
      await supabase
        .from("bug_reports")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", recent.id);
      return NextResponse.json({ ok: true, deduped: true, id: recent.id });
    }

    const { data: row, error } = await supabase
      .from("bug_reports")
      .insert({
        reporter_user_id: user?.id ?? null,
        reporter_email: user?.email ?? null,
        reporter_role: role,
        title,
        description,
        severity: source === "global" ? "high" : "normal",
        page_url: url,
        user_agent: userAgent,
        status: "open",
      })
      .select("id, created_at")
      .single();

    if (error || !row) {
      console.error("[log-error] insert failed:", error?.message);
      return NextResponse.json({ ok: false, reason: "insert_failed" }, { status: 200 });
    }

    // Fire and forget email — return fast.
    const mail = await sendBugReportEmail({
      id: row.id as string,
      title,
      description,
      severity: source === "global" ? "high" : "normal",
      reporter_email: user?.email ?? null,
      reporter_role: role,
      page_url: url,
      user_agent: userAgent,
      created_at: (row as { created_at: string }).created_at,
    });
    await supabase
      .from("bug_reports")
      .update({
        emailed_at: mail.ok ? new Date().toISOString() : null,
        email_error: mail.ok ? null : (mail.error ?? "unknown"),
      })
      .eq("id", row.id);

    return NextResponse.json({ ok: true, id: row.id, emailed: mail.ok });
  } catch (err) {
    // Never let the error-reporter itself crash.
    console.error("[/api/log-error] handler failed:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

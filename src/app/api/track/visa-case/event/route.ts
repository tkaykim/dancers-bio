import { NextResponse, type NextRequest } from "next/server";
import {
  recordVisaCaseTrackingEvent,
  verifyVisaFollowupTrackingToken,
} from "@/lib/visa/tracking";

const ALLOWED_EVENTS = new Set([
  "case_visit",
  "language_view",
  "step_view",
  "scroll_depth",
  "case_exit",
  "follow_up_submit_success",
]);

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function intValue(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textValue(value: unknown, max = 300): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const tracking = verifyVisaFollowupTrackingToken(textValue(body.t, 1200));
  const eventType = textValue(body.eventType, 80);
  if (!tracking || !eventType || !ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await recordVisaCaseTrackingEvent({
    ...tracking,
    eventType,
    eventKey: textValue(body.eventKey, 120),
    lang: textValue(body.lang, 12),
    step: intValue(body.step, 0, 5),
    scrollDepth: intValue(body.scrollDepth, 0, 100),
    pagePath: textValue(body.pagePath, 500),
    metadata: typeof body.metadata === "object" && body.metadata != null ? body.metadata as Record<string, unknown> : {},
    request,
  });

  return NextResponse.json({ ok: true }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

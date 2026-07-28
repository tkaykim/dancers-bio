import { NextResponse, type NextRequest } from "next/server";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  recordVisaCaseTrackingEvent,
  verifyVisaFollowupTrackingToken,
} from "@/lib/visa/tracking";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");

// 메일 CTA가 여러 개인 캠페인을 위해 k(=이벤트 키)와 decline(=사유 설문 바로 열기)을 허용한다.
const EVENT_KEYS = new Set(["email_cta", "email_cta_continue", "email_cta_decline", "email_cta_reschedule"]);

export async function GET(request: NextRequest) {
  const trackingToken = request.nextUrl.searchParams.get("t");
  const lang = request.nextUrl.searchParams.get("lang");
  const requestedKey = request.nextUrl.searchParams.get("k");
  const eventKey = requestedKey && EVENT_KEYS.has(requestedKey) ? requestedKey : "email_cta";
  const decline = request.nextUrl.searchParams.get("decline") === "1";
  const tracking = verifyVisaFollowupTrackingToken(trackingToken);
  if (!tracking || !trackingToken) {
    return NextResponse.redirect(new URL("/program", SITE_URL));
  }

  await recordVisaCaseTrackingEvent({
    ...tracking,
    eventType: "cta_click",
    eventKey,
    lang,
    pagePath: request.nextUrl.pathname,
    request,
  });

  const url = new URL(`/visa/case/${makeVisaCaseToken(tracking.applicationId)}`, SITE_URL);
  url.searchParams.set("vt", trackingToken);
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "visa_followup");
  url.searchParams.set("utm_campaign", tracking.campaign);
  if (lang) url.searchParams.set("lang", lang);
  if (decline) url.searchParams.set("decline", "1");
  return NextResponse.redirect(url);
}

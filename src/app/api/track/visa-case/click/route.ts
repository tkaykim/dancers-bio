import { NextResponse, type NextRequest } from "next/server";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  recordVisaCaseTrackingEvent,
  verifyVisaFollowupTrackingToken,
} from "@/lib/visa/tracking";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");

export async function GET(request: NextRequest) {
  const trackingToken = request.nextUrl.searchParams.get("t");
  const lang = request.nextUrl.searchParams.get("lang");
  const tracking = verifyVisaFollowupTrackingToken(trackingToken);
  if (!tracking || !trackingToken) {
    return NextResponse.redirect(new URL("/program", SITE_URL));
  }

  await recordVisaCaseTrackingEvent({
    ...tracking,
    eventType: "cta_click",
    eventKey: "email_cta",
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
  return NextResponse.redirect(url);
}

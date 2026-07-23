import { NextResponse, type NextRequest } from "next/server";
import {
  recordVisaCaseTrackingEvent,
  verifyVisaFollowupTrackingToken,
} from "@/lib/visa/tracking";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const tracking = verifyVisaFollowupTrackingToken(request.nextUrl.searchParams.get("t"));
    if (!tracking) return pixelResponse();
    await recordVisaCaseTrackingEvent({
      ...tracking,
      eventType: "email_open",
      eventKey: "pixel",
      lang: request.nextUrl.searchParams.get("lang"),
      pagePath: request.nextUrl.pathname,
      request,
    });
  } catch {
    // Pixel should never fail because tracking failed.
  }
  return pixelResponse();
}

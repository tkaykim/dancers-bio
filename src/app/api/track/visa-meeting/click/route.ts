import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordVisaCaseTrackingEvent,
  verifyVisaFollowupTrackingToken,
} from "@/lib/visa/tracking";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 미팅 안내 메일의 링크 클릭을 기록한 뒤, DB에 저장된 미팅 주소로 보낸다.
// 리다이렉트 대상은 항상 DB 값이라 오픈 리다이렉트가 되지 않는다.
export async function GET(request: NextRequest) {
  const trackingToken = request.nextUrl.searchParams.get("t");
  const lang = request.nextUrl.searchParams.get("lang");
  const inviteId = request.nextUrl.searchParams.get("i");
  const tracking = verifyVisaFollowupTrackingToken(trackingToken);

  if (!tracking || !inviteId || !UUID_RE.test(inviteId)) {
    return NextResponse.redirect(new URL("/program", SITE_URL));
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("visa_meeting_invites")
    .select("id, application_id, meeting_url")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite || invite.application_id !== tracking.applicationId) {
    return NextResponse.redirect(new URL("/program", SITE_URL));
  }

  await recordVisaCaseTrackingEvent({
    ...tracking,
    eventType: "cta_click",
    eventKey: "meeting_link",
    lang,
    pagePath: request.nextUrl.pathname,
    metadata: { inviteId },
    request,
  });

  return NextResponse.redirect(invite.meeting_url as string);
}

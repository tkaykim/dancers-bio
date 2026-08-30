import { type NextRequest, NextResponse } from "next/server";
import {
  RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS,
  recruitmentAttributionCookieName,
  resolveRecruitmentChannelDestination,
  shouldStoreRecruitmentAttributionCookie,
} from "@/lib/recruitment-attribution";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const admin = createAdminClient();
  const resolved = await resolveRecruitmentChannelDestination({
    shareCode: code,
    findChannel: async (shareCode) => {
      const { data } = await admin
        .from("recruitment_channels")
        .select("project_id, legacy_project_id, share_code, status")
        .eq("share_code", shareCode)
        .maybeSingle();
      return data;
    },
    findProject: async (projectId) => {
      const { data } = await admin
        .from("projects")
        .select("short_code, deleted_at")
        .eq("id", projectId)
        .maybeSingle();
      return data;
    },
  });

  if (!resolved) {
    return new Response(null, { status: 404 });
  }

  const destination = new URL(
    `/projects/${resolved.projectShortCode}`,
    request.url,
  );
  destination.searchParams.set("channel", resolved.shareCode);
  const response = NextResponse.redirect(destination);
  const cookieName = recruitmentAttributionCookieName(resolved.projectId);
  const storedShareCode = request.cookies.get(cookieName)?.value;

  // 마지막으로 확인된 유효 링크를 유지해 URL 채널과 가입 후 복구되는 채널을 일치시킨다.
  // 같은 링크 재방문 때는 쿠키 만료를 불필요하게 갱신하지 않는다.
  if (
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode,
      incomingShareCode: resolved.shareCode,
    })
  ) {
    response.cookies.set(cookieName, resolved.shareCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS,
    });
  }

  return response;
}

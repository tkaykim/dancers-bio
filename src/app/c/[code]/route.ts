import { type NextRequest, NextResponse } from "next/server";
import {
  normalizeRecruitmentShareCode,
  RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS,
  recruitmentAttributionCookieName,
} from "@/lib/recruitment-attribution";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const shareCode = normalizeRecruitmentShareCode(code);
  if (!shareCode) return new Response(null, { status: 404 });

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("recruitment_channels")
    .select("project_id, legacy_project_id, share_code, status")
    .eq("share_code", shareCode)
    .maybeSingle();

  if (!channel || channel.status !== "active") {
    return new Response(null, { status: 404 });
  }
  const targetProjectId =
    ((channel.legacy_project_id as string | null) ?? null) ||
    (channel.project_id as string);

  const { data: project } = await admin
    .from("projects")
    .select("short_code, deleted_at")
    .eq("id", targetProjectId)
    .maybeSingle();

  if (!project || project.deleted_at) {
    return new Response(null, { status: 404 });
  }

  const destination = new URL(`/projects/${project.short_code}`, request.url);
  destination.searchParams.set("channel", shareCode);
  const response = NextResponse.redirect(destination);
  const cookieName = recruitmentAttributionCookieName(targetProjectId);

  // 같은 프로젝트에서 먼저 유입된 채널을 유지한다.
  // 가입·프로필 생성 중 URL 파라미터가 사라져도 지원 저장 단계에서 이 값을 복구한다.
  if (!request.cookies.has(cookieName)) {
    response.cookies.set(cookieName, shareCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS,
    });
  }

  return response;
}

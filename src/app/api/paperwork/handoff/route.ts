import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canManageProject, getProfile, getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyProjectIdentifier } from "@/lib/projectId";

// 그리고엔터 공통 거래 서류(grigoent.co.kr/paperwork)로 프로젝트 담당자를 넘긴다.
// can_manage_project(소유자·관리자·공동관리자)를 확인하고 공유 비밀키로 서명한 10분짜리 토큰을 붙인다.
const PAPERWORK_START_URL = "https://www.grigoent.co.kr/paperwork/start";

function sign(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function GET(req: NextRequest) {
  const ident = classifyProjectIdentifier(req.nextUrl.searchParams.get("project") ?? "");
  const user = await getUser();
  if (!user) {
    const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.nextUrl.origin));
  }
  const secret = process.env.PAPERWORK_HANDOFF_SECRET;
  if (!secret) return NextResponse.json({ error: "거래 서류 연동 설정이 없습니다." }, { status: 500 });
  if (!ident) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const { data: project } = await createAdminClient()
    .from("projects")
    .select("id, title")
    .eq(ident.kind === "uuid" ? "id" : "short_code", ident.value)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (!(await canManageProject(project.id as string))) {
    return NextResponse.json({ error: "이 프로젝트의 담당자만 사용할 수 있습니다." }, { status: 403 });
  }

  const profile = await getProfile();
  const token = sign(
    {
      app: "deetz",
      uid: user.id,
      name: `deetz ${profile?.display_name || "담당자"}`,
      email: user.email || undefined,
      project: project.title as string,
      projectRef: project.id as string,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    secret,
  );
  return NextResponse.redirect(`${PAPERWORK_START_URL}?h=${encodeURIComponent(token)}`);
}

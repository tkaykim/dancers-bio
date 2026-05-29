import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";

/**
 * 온보딩/캐스팅 초대 메일 발송 (관리자 전용).
 *
 * 흐름:
 *  1) 대상 이메일로 미리 만들어둔(curation) 댄서를 조회해 이름을 가져온다.
 *  2) service-role 로 recovery 링크(비밀번호 설정 링크)를 생성한다.
 *  3) dancers.bio Gmail 로 온보딩 문구 메일을 발송한다.
 *
 * 인증: Authorization: Bearer <admin access_token>
 * Body: { email: string }
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dancers-bio-lite.vercel.app";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function buildHtml(name: string | null, link: string): string {
  const hi = name ? `${escapeHtml(name)}님, ` : "";
  return `<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111111;padding:8px 4px;">
  <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;padding:8px 0;">dancers.bio<span style="color:#6366f1;">.</span></div>
  <p style="font-size:14px;line-height:1.7;color:#222;">안녕하세요 ${hi}<b>그리고엔터테인먼트</b>입니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">에이전시 풀에 프로필을 제출해 주셔서 감사합니다. 현재 시범 운영 중인 댄서 구인·구직 &amp; 프로필 관리 플랫폼 <b>dancers.bio</b>에 회원님의 프로필을 미리 만들어 두었습니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">아래 버튼에서 <b>비밀번호만 설정</b>하시면 바로 이용하실 수 있어요:</p>
  <ul style="font-size:14px;line-height:1.8;color:#444;margin:8px 0 0 18px;padding:0;">
    <li>내 <b>프로필·포트폴리오</b> 확인 및 수정</li>
    <li>현재 <b>구인 중인 프로젝트</b> 확인 및 제안 응답</li>
  </ul>
  <p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:10px;">비밀번호 설정하고 내 프로필 확인하기</a></p>
  <p style="font-size:12px;color:#aaaaaa;margin-top:8px;">본인이 제출하신 적이 없다면 이 메일을 무시하셔도 됩니다. 링크는 약 1시간 동안 유효합니다.</p>
  <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;">
  <p style="font-size:11px;color:#bbbbbb;">dancers.bio · 한국 댄스 신을 위한 프로필 &amp; 캐스팅 플랫폼</p>
</div>`;
}

function buildText(name: string | null, link: string): string {
  const hi = name ? `${name}님, ` : "";
  return `안녕하세요 ${hi}그리고엔터테인먼트입니다.

에이전시 풀에 프로필을 제출해 주셔서 감사합니다.
현재 시범 운영 중인 댄서 구인·구직 & 프로필 관리 플랫폼 dancers.bio에 회원님의 프로필을 미리 만들어 두었습니다.

아래 링크에서 비밀번호만 설정하시면 바로 이용하실 수 있어요:
- 내 프로필·포트폴리오 확인 및 수정
- 현재 구인 중인 프로젝트 확인 및 제안 응답

비밀번호 설정하고 내 프로필 확인하기:
${link}

본인이 제출하신 적이 없다면 이 메일을 무시하셔도 됩니다. 링크는 약 1시간 동안 유효합니다.

dancers.bio · 한국 댄스 신을 위한 프로필 & 캐스팅 플랫폼`;
}

async function requireAdmin(req: NextRequest) {
  const token = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;
  const admin = createAdminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: prof } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return prof?.is_admin ? user : null;
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { email?: string } = {};
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    // ignore
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 대상 댄서 이름 (있으면 인사말에 사용)
  const { data: dancer } = await admin
    .from("dancers")
    .select("stage_name, slug")
    .filter("social_links->>source_email", "eq", email)
    .maybeSingle();

  // 비밀번호 설정(recovery) 링크 생성
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/reset-password` },
  });
  const actionLink = linkData?.properties?.action_link;
  if (linkErr || !actionLink) {
    return NextResponse.json(
      { ok: false, error: linkErr?.message ?? "이 이메일의 계정을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  const name = (dancer?.stage_name as string | null) ?? null;
  const sent = await sendGmailEmail({
    to: email,
    subject: "[dancers.bio] 프로필이 준비됐어요 · 비밀번호 설정 안내",
    text: buildText(name, actionLink),
    html: buildHtml(name, actionLink),
  });

  return NextResponse.json({
    ok: sent.ok,
    error: sent.error ?? null,
    sent_to: email,
    dancer: name,
  });
}

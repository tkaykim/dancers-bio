import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";

/**
 * 온보딩/캐스팅 초대 메일 발송 (관리자 전용).
 *
 * 방식: 발급형 자격증명
 *  1) 대상 이메일의 auth 계정에 임시 비밀번호를 새로 발급(설정)한다.
 *  2) 지원 이메일로 미리 만들어둔 댄서 프로필을 해당 계정에 연결한다.
 *  3) dancers.bio Gmail 로 "이메일 + 임시 비밀번호 + 로그인 링크" 메일을 보낸다.
 *
 * 인증: Authorization: Bearer <admin access_token>
 * Body: { email: string }
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dancers-bio-lite.vercel.app";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 임시 비밀번호: 숫자 6자리 (앞자리 0 허용)
function genPassword(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1000000;
  return n.toString().padStart(6, "0");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function buildHtml(name: string | null, email: string, pw: string, loginUrl: string): string {
  const hi = name ? `${escapeHtml(name)}님, ` : "";
  return `<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111111;padding:8px 4px;">
  <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;padding:8px 0;">dancers.bio<span style="color:#6366f1;">.</span></div>
  <p style="font-size:14px;line-height:1.7;color:#222;">안녕하세요 ${hi}<b>그리고엔터테인먼트</b>입니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">에이전시 풀에 프로필을 제출해 주셔서 감사합니다. 현재 시범 운영 중인 댄서 구인·구직 &amp; 프로필 관리 플랫폼 <b>dancers.bio</b>에 회원님의 프로필을 미리 만들어 두었습니다.</p>
  <p style="font-size:14px;line-height:1.7;color:#444;">아래 정보로 <b>로그인</b>하시면 바로 확인하실 수 있어요:</p>
  <ul style="font-size:14px;line-height:1.8;color:#444;margin:8px 0 0 18px;padding:0;">
    <li>내 <b>프로필·포트폴리오</b> 확인 및 수정</li>
    <li>현재 <b>구인 중인 프로젝트</b> 확인 및 제안 응답</li>
  </ul>
  <div style="margin:18px 0;padding:16px 18px;background:#fafafa;border:1px solid #eee;border-radius:12px;font-size:14px;color:#222;">
    <div style="margin-bottom:6px;">이메일 &nbsp;<b>${escapeHtml(email)}</b></div>
    <div>임시 비밀번호 (숫자 6자리) &nbsp;<b style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px;font-size:16px;">${escapeHtml(pw)}</b></div>
  </div>
  <p style="margin:20px 0;"><a href="${loginUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:10px;">로그인하고 내 프로필 확인하기</a></p>
  <p style="font-size:12px;line-height:1.6;color:#888;">보안을 위해 로그인 후 <b>[내 정보 → 비밀번호 변경]</b>에서 비밀번호를 꼭 바꿔 주세요.</p>
  <p style="font-size:12px;color:#aaaaaa;margin-top:6px;">본인이 제출하신 적이 없다면 이 메일을 무시하셔도 됩니다.</p>
  <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;">
  <p style="font-size:11px;color:#bbbbbb;">dancers.bio · 한국 댄스 신을 위한 프로필 &amp; 캐스팅 플랫폼</p>
</div>`;
}

function buildText(name: string | null, email: string, pw: string, loginUrl: string): string {
  const hi = name ? `${name}님, ` : "";
  return `안녕하세요 ${hi}그리고엔터테인먼트입니다.

에이전시 풀에 프로필을 제출해 주셔서 감사합니다.
현재 시범 운영 중인 댄서 구인·구직 & 프로필 관리 플랫폼 dancers.bio에 회원님의 프로필을 미리 만들어 두었습니다.

아래 정보로 로그인하시면 바로 확인하실 수 있어요:
- 내 프로필·포트폴리오 확인 및 수정
- 현재 구인 중인 프로젝트 확인 및 제안 응답

[로그인 정보]
이메일: ${email}
임시 비밀번호(숫자 6자리): ${pw}

로그인하기: ${loginUrl}

보안을 위해 로그인 후 [내 정보 → 비밀번호 변경]에서 비밀번호를 꼭 바꿔 주세요.
본인이 제출하신 적이 없다면 이 메일을 무시하셔도 됩니다.

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

  // 1) 대상 계정 id 조회
  const { data: userId, error: idErr } = await admin.rpc("admin_user_id_by_email", {
    p_email: email,
  });
  if (idErr || !userId) {
    return NextResponse.json(
      { ok: false, error: "이 이메일의 계정을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  // 2) 임시 비밀번호 발급
  const tempPw = genPassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId as string, {
    password: tempPw,
  });
  if (pwErr) {
    return NextResponse.json({ ok: false, error: pwErr.message }, { status: 400 });
  }

  // 3) 미리 만들어둔 댄서 프로필을 이 계정에 연결 (미연결인 것만)
  const { data: linkedRows } = await admin
    .from("dancers")
    .update({ profile_id: userId as string })
    .filter("social_links->>source_email", "eq", email)
    .is("profile_id", null)
    .select("stage_name, slug");

  // 이름·slug: 방금 연결됐거나 이미 연결돼 있는 댄서에서 가져옴
  let name = (linkedRows?.[0]?.stage_name as string | null) ?? null;
  let slug = (linkedRows?.[0]?.slug as string | null) ?? null;
  if (!name) {
    const { data: dr } = await admin
      .from("dancers")
      .select("stage_name, slug")
      .eq("profile_id", userId as string)
      .maybeSingle();
    name = (dr?.stage_name as string | null) ?? null;
    slug = (dr?.slug as string | null) ?? null;
  }

  // 메일 버튼 → 프로필 미리보기 + 로그인 팝업이 있는 /welcome
  const welcomeUrl = slug
    ? `${SITE_URL}/welcome?d=${encodeURIComponent(slug)}&email=${encodeURIComponent(email)}`
    : `${SITE_URL}/login`;
  const sent = await sendGmailEmail({
    to: email,
    subject: "[dancers.bio] 프로필이 준비됐어요 · 로그인 정보 안내",
    text: buildText(name, email, tempPw, welcomeUrl),
    html: buildHtml(name, email, tempPw, welcomeUrl),
  });

  return NextResponse.json({
    ok: sent.ok,
    error: sent.error ?? null,
    sent_to: email,
    dancer: name,
    linked: (linkedRows?.length ?? 0) > 0,
  });
}

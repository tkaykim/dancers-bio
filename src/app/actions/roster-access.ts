"use server";

import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import type { ActionResult } from "./auth";

const NOTIFY_TO = "deetzmagazine@gmail.com";
const COOLDOWN_HOURS = 24;

/**
 * 디렉토리 40개 캡 초과 시 "추가 열람 요청" — 로그인 사용자만.
 * 요청을 roster_access_requests 에 기록(감사·리드)하고, 관리자에게 메일 발송한다.
 * 메일 From 은 앱 Gmail, Reply-To = 요청자 이메일(가입 이메일)이라 답장 시 본인에게 전달된다.
 */
export async function requestRosterAccessAction(): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "로그인 후 이용할 수 있습니다." };
  }
  const email = user.email;
  if (!email) {
    return { ok: false, error: "이메일 정보를 확인할 수 없습니다." };
  }

  const admin = createAdminClient();

  // 스팸 방지: 동일 사용자 24시간 1회.
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("roster_access_requests")
    .select("id")
    .eq("profile_id", user.id)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    return {
      ok: false,
      error: "이미 요청이 접수되었습니다. 검토 후 연락드리겠습니다.",
    };
  }

  // 디스플레이 이름(있으면) 조회 — 메일 본문용.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = (profile?.display_name as string | null) ?? email;

  // 기록 (감사 + 리드)
  await admin.from("roster_access_requests").insert({
    profile_id: user.id,
    email,
    context: "directory_more_than_40",
  });

  // 관리자 메일 발송
  const subject = `[deetz] 댄서 풀 추가 열람 요청 — ${displayName}`;
  const text =
    `디렉토리에서 40개 이상 추가 열람을 요청한 사용자가 있습니다.\n\n` +
    `요청자: ${displayName}\n` +
    `이메일: ${email}\n` +
    `사용자 ID: ${user.id}\n\n` +
    `이 메일에 그대로 답장하면 요청자(${email})에게 전달됩니다.`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;color:#111">` +
    `<p>디렉토리에서 <b>40개 이상 추가 열람</b>을 요청한 사용자가 있습니다.</p>` +
    `<p>요청자: <b>${displayName}</b><br>` +
    `이메일: <a href="mailto:${email}">${email}</a><br>` +
    `사용자 ID: ${user.id}</p>` +
    `<p style="color:#555">이 메일에 그대로 <b>답장</b>하면 요청자(${email})에게 전달됩니다.</p>` +
    `</div>`;

  const sent = await sendGmailEmail({
    to: NOTIFY_TO,
    subject,
    text,
    html,
    replyTo: email,
  });
  if (!sent.ok) {
    return { ok: false, error: "요청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { ok: true, data: null };
}

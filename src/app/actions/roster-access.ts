"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { sendGmailEmail } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rosterAccessPurposeLabel,
  type RosterAccessPurpose,
} from "@/lib/roster-access";
import type { ActionResult } from "./auth";

const NOTIFY_TO = "deetzmagazine@gmail.com";
const COOLDOWN_HOURS = 24;

const RosterAccessRequestSchema = z.object({
  purpose: z.enum(["profile_check", "casting", "collaboration"]),
  details: z.string().trim().max(2000).optional(),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[char] ?? char;
  });
}

/**
 * Capture a casting or collaboration lead without exposing the protected roster.
 * Profile-check users are handled in the UI with their own public profile links.
 */
export async function requestRosterAccessAction(input: {
  purpose: RosterAccessPurpose;
  details?: string;
}): Promise<ActionResult<null>> {
  const parsed = RosterAccessRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "열람 목적과 문의 내용을 확인해 주세요." };
  }

  const purpose = parsed.data.purpose as RosterAccessPurpose;
  if (purpose === "profile_check") {
    return {
      ok: false,
      error: "프로필 확인은 아래 안내된 내 프로필 링크에서 바로 확인할 수 있습니다.",
    };
  }
  const details = parsed.data.details?.trim() ?? "";
  if (details.length < 10) {
    return { ok: false, error: "구체적인 내용을 10자 이상 작성해 주세요." };
  }

  const user = await getUser();
  if (!user) {
    return { ok: false, error: "로그인 후 이용할 수 있습니다." };
  }
  const email = user.email;
  if (!email) {
    return { ok: false, error: "이메일 정보를 확인할 수 없습니다." };
  }

  const admin = createAdminClient();
  const since = new Date(
    Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: recent } = await admin
    .from("roster_access_requests")
    .select("id")
    .eq("profile_id", user.id)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    return {
      ok: false,
      error: "이미 문의가 접수되었습니다. 검토 후 연락드리겠습니다.",
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = profile?.display_name || email;

  const { error: insertError } = await admin
    .from("roster_access_requests")
    .insert({
      profile_id: user.id,
      email,
      context: "directory_more_than_40",
      purpose,
      details,
    });
  if (insertError) {
    console.error("[roster-access] insert failed:", insertError.message);
    return {
      ok: false,
      error: "요청 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const purposeLabel = rosterAccessPurposeLabel(purpose);
  const safeDisplayName = escapeHtml(displayName);
  const safeEmail = escapeHtml(email);
  const safeUserId = escapeHtml(user.id);
  const safeDetails = escapeHtml(details).replace(/\r?\n/g, "<br>");
  const subject = `[deetz] ${purpose === "casting" ? "캐스팅" : "협업·제휴"} 문의 — ${displayName}`;
  const text =
    `${purposeLabel}\n\n` +
    `요청자: ${displayName}\n` +
    `이메일: ${email}\n` +
    `사용자 ID: ${user.id}\n` +
    `문의 내용:\n${details}\n\n` +
    `이 메일에 그대로 답장하면 요청자(${email})에게 전달됩니다.`;
  const html =
    `<div style="margin:0;background:#f4f4f5;padding:24px;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial;color:#111">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden">` +
    `<div style="padding:28px 28px 24px">` +
    `<div style="font-size:24px;font-weight:800">deetz<span style="color:#d4d4d8">.</span> <span style="font-size:12px;font-weight:500;color:#8b8b91">문의 알림</span></div>` +
    `<p style="margin:22px 0 8px;font-size:13px;color:#6b7280">${escapeHtml(purposeLabel)}</p>` +
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.45">새로운 문의가 접수되었습니다.</h1>` +
    `<div style="padding:16px;background:#f6f6f7;border:1px solid #ececef;border-radius:14px;font-size:14px;line-height:1.8">` +
    `<b>요청자</b> ${safeDisplayName}<br>` +
    `<b>이메일</b> <a href="mailto:${safeEmail}">${safeEmail}</a><br>` +
    `<b>사용자 ID</b> ${safeUserId}<br>` +
    `<b>문의 내용</b><br>${safeDetails}` +
    `</div>` +
    `<p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.7">이 메일에 그대로 답장하면 요청자에게 전달됩니다.</p>` +
    `</div>` +
    `<div style="padding:18px 28px;border-top:1px solid #ececef;background:#fafafa;color:#6b7280;font-size:12px;line-height:1.8">` +
    `<b style="color:#111">deetz</b> · <a href="https://deetz.kr">deetz.kr</a><br>` +
    `<a href="https://www.instagram.com/deetz.kr/">Instagram @deetz.kr</a> · <a href="https://www.youtube.com/@deetzmagazine">YouTube @deetzmagazine</a>` +
    `</div></div></div>`;

  const sent = await sendGmailEmail({
    to: NOTIFY_TO,
    subject,
    text,
    html,
    replyTo: email,
  });
  if (!sent.ok) {
    return {
      ok: false,
      error: "요청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return { ok: true, data: null };
}

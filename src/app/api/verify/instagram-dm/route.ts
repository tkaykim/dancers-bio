import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Instagram DM 본인인증 자동 대조 엔드포인트 (서버-투-서버).
 *
 * 흐름: @deetz.kr 로 온 DM → Meta webhook → 허브 social_inbox_events 적재
 *       → 워커(deetz:dm-intelligence)가 6자리 코드를 발견하면 이 라우트를 호출
 *       → deetz 앱이 자기 DB에서 대조·승인하고 결과 문구를 돌려준다.
 *
 * 왜 앱이 승인하나: dancersbio DB 쓰기는 이 앱의 책임이다.
 * 오케스트레이터 워커는 BU DB를 SELECT 만 하도록 되어 있어서, 승인 write 를 여기로 모은다.
 *
 * Auth: body.secret 공유 비밀 (env DM_VERIFY_WEBHOOK_SECRET). 미설정이면 503 으로 하드 비활성.
 * 승인 정책: 코드 일치 + 미만료 + **보낸 사람의 인스타 핸들이 신청 핸들과 동일**할 때만 자동승인.
 *            claim(프로필 소유권 이전)은 자동으로 처리하지 않고 관리자 큐에 남긴다.
 */

type Body = {
  secret?: string;
  code?: string;
  sender_username?: string | null;
  sender_id?: string | null;
  message?: string | null;
  mid?: string | null;
};

type Outcome =
  | "approved"
  | "already_approved"
  | "handle_mismatch"
  | "expired"
  | "not_found"
  | "ambiguous";

const REPLY: Record<Outcome, string> = {
  approved:
    "인증이 완료되었습니다. deetz 웹사이트로 돌아가시면 인스타그램 인증이 승인된 상태로 보입니다.",
  already_approved: "이미 인증이 완료된 요청입니다. deetz 웹사이트에서 확인해 주세요.",
  handle_mismatch:
    "코드는 확인했지만, 신청하신 인스타그램 계정과 지금 메시지를 보낸 계정이 달라서 자동 승인은 하지 못했습니다. 신청한 계정으로 다시 보내주시거나 잠시만 기다려 주시면 담당자가 확인하겠습니다.",
  expired:
    "인증 코드가 만료되었습니다. deetz 웹사이트에서 코드를 다시 발급받아 보내주세요.",
  not_found:
    "확인되지 않는 코드입니다. deetz 웹사이트의 인스타그램 인증 화면에서 발급된 6자리 코드를 그대로 보내주세요.",
  ambiguous: "확인이 필요한 요청입니다. 담당자가 확인 후 안내드리겠습니다.",
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export async function POST(req: Request) {
  const expected = process.env.DM_VERIFY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "DM_VERIFY_WEBHOOK_SECRET 미설정 — 엔드포인트 비활성" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.secret !== "string" || typeof body.code !== "string") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!safeEqual(body.secret, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const code = body.code.trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "bad_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("instagram_verifications")
    .select("id, profile_id, code, instagram_handle, status, expires_at, claim_request_id")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, outcome: "not_found", reply: REPLY.not_found });
  }
  if (list.some((r) => r.status === "approved")) {
    return NextResponse.json({
      ok: true,
      outcome: "already_approved",
      reply: REPLY.already_approved,
    });
  }

  const pending = list.filter((r) => r.status === "pending");
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, outcome: "not_found", reply: REPLY.not_found });
  }
  if (pending.length > 1) {
    // 같은 코드가 동시에 두 건 열려 있으면 자동으로 고르지 않는다.
    return NextResponse.json({ ok: true, outcome: "ambiguous", reply: REPLY.ambiguous });
  }

  const target = pending[0];
  if (new Date(target.expires_at).getTime() <= Date.now()) {
    await admin
      .from("instagram_verifications")
      .update({ status: "expired" })
      .eq("id", target.id)
      .eq("status", "pending");
    return NextResponse.json({ ok: true, outcome: "expired", reply: REPLY.expired });
  }

  const sender = normalizeHandle(body.sender_username);
  const requested = normalizeHandle(target.instagram_handle);
  if (!sender || sender !== requested) {
    return NextResponse.json({
      ok: true,
      outcome: "handle_mismatch",
      reply: REPLY.handle_mismatch,
      verification_id: target.id,
      expected_handle: target.instagram_handle,
      sender_handle: body.sender_username ?? null,
      needs_human: true,
    });
  }

  // 승인은 system 전용 RPC 를 쓴다.
  //
  // ⚠️ 관리자용 approve_instagram_verification 을 쓰면 안 된다.
  //    그 함수는 첫 줄에서 is_admin() 을 요구하는데, is_admin() 은
  //    `select is_admin from profiles where id = auth.uid()` 이고,
  //    이 라우트는 service-role 로 호출하므로 auth.uid() 가 null → 항상 'admin only' 예외였다.
  //    즉 이 경로는 배포돼 있어도 100% 실패했다(2026-08-14 운영 DB에서 실증).
  //
  // system_approve_instagram_verification 은 service_role 에만 EXECUTE 가 있고,
  // 부수효과(can_create_project 발급·핸들 기록·감사로그)는 관리자 경로와 동일하다.
  // 사람이 아니라 시스템이 승인했음은 감사로그 사유에 남는다.
  let approved = false;
  let approveError: string | null = null;

  const { error: rpcError } = await admin.rpc("system_approve_instagram_verification", {
    p_verification_id: target.id,
    p_reason: "instagram_dm_auto",
  });
  if (!rpcError) approved = true;
  else approveError = rpcError.message;

  if (!approved) {
    return NextResponse.json({
      ok: false,
      outcome: "ambiguous",
      reply: REPLY.ambiguous,
      verification_id: target.id,
      error: approveError,
      needs_human: true,
    });
  }

  return NextResponse.json({
    ok: true,
    outcome: "approved",
    reply: REPLY.approved,
    verification_id: target.id,
    profile_id: target.profile_id,
    // claim(프로필 소유권 이전)은 사람이 확인한다 — 자동 승인 범위 밖.
    claim_request_id: target.claim_request_id,
    needs_human: Boolean(target.claim_request_id),
  });
}

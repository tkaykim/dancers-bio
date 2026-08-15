import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { loadSubmissionByToken, submissionAdminClient } from "@/lib/submissions/lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 제출자가 본인 인스타그램 핸들을 수정한다.
 *
 * deetz 프로필의 인스타 링크가 예전 계정이거나 오타인 경우가 있어 제출 시점에 바로잡게 한다.
 * 파일명이 이 핸들로 정해지므로, 다른 제출자가 이미 쓰고 있는 핸들은 막는다.
 * (겹치면 Drive 에서 누구 영상인지 구분할 수 없다)
 */

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/** URL·@ 등 붙여 넣은 형태를 핸들만 남기고 정규화한다. */
function normalize(raw: string): string | null {
  let v = String(raw ?? "").trim().replace(/^@/, "");
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  v = v.split(/[?#]/)[0].replace(/\/+$/, "").split("/")[0].toLowerCase();
  return HANDLE_RE.test(v) ? v : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    const sub = await loadSubmissionByToken(token);
    if (!sub) {
      return NextResponse.json({ ok: false, error: "유효하지 않은 링크입니다." }, { status: 404 });
    }
    if (!sub.open) {
      return NextResponse.json({ ok: false, error: sub.reason }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { handle?: string };
    const handle = normalize(body.handle ?? "");
    if (!handle) {
      return NextResponse.json(
        { ok: false, error: "인스타그램 아이디 형식이 올바르지 않습니다. 영문·숫자·마침표·밑줄만 쓸 수 있습니다." },
        { status: 400 },
      );
    }
    if (handle === sub.instagramHandle) {
      return NextResponse.json({ ok: true, handle, unchanged: true });
    }

    const admin = submissionAdminClient();

    // 같은 공고 안에서 다른 사람이 이미 쓰는 핸들이면 막는다.
    const { data: clash } = await admin
      .from("project_submissions")
      .select("id")
      .eq("project_id", sub.projectId)
      .eq("instagram_handle", handle)
      .neq("id", sub.id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { ok: false, error: "이미 다른 참여자가 등록한 아이디입니다. 본인 계정이 맞다면 contact@deetz.kr 로 알려주세요." },
        { status: 409 },
      );
    }

    const { error } = await admin
      .from("project_submissions")
      .update({ instagram_handle: handle })
      .eq("id", sub.id);
    if (error) {
      return NextResponse.json({ ok: false, error: "저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, handle });
  } catch (e) {
    const message = e instanceof Error ? e.message : "저장하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

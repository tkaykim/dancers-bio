import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { loadSubmissionByToken, submissionAdminClient } from "@/lib/submissions/lookup";
import { localeFor } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 함께 촬영한 사람의 인스타 아이디를 메모로 남긴다.
 *
 * 정산 인원 산정과는 무관하다 — 운영자가 나중에 보고 판단하기 위한 기록이다.
 * 그래서 본인 핸들처럼 중복을 막지 않는다.
 * 한 사람이 여러 영상에 나올 수 있고, 그걸 어떻게 셀지는 사람이 정한다.
 */

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const MAX = 10;

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
      return NextResponse.json(
        { ok: false, error: t(await localeFor(), "submit.api.invalid_link") },
        { status: 404 },
      );
    }
    if (!sub.open) {
      return NextResponse.json({ ok: false, error: sub.reason }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { handles?: unknown };
    const raw = Array.isArray(body.handles) ? body.handles : [];
    if (raw.length > MAX) {
      return NextResponse.json(
        { ok: false, error: `공동작업자는 최대 ${MAX}명까지 남기실 수 있습니다.` },
        { status: 400 },
      );
    }

    const bad: string[] = [];
    const seen = new Set<string>();
    const handles: string[] = [];
    for (const item of raw) {
      const text = String(item ?? "").trim();
      if (!text) continue;
      const h = normalize(text);
      if (!h) {
        bad.push(text);
        continue;
      }
      // 본인은 공동작업자가 아니다.
      if (h === sub.instagramHandle) continue;
      if (seen.has(h)) continue;
      seen.add(h);
      handles.push(h);
    }

    if (bad.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `형식이 올바르지 않은 아이디가 있습니다: ${bad.slice(0, 3).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const admin = submissionAdminClient();
    const { error } = await admin
      .from("project_submissions")
      .update({ collaborator_handles: handles })
      .eq("id", sub.id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: t(sub.locale, "submit.api.save_failed") },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, handles });
  } catch (e) {
    const message = e instanceof Error ? e.message : "저장하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

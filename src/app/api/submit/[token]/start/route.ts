import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { loadSubmissionByToken } from "@/lib/submissions/lookup";
import { createResumableSession } from "@/lib/drive/resumable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 영상 원본이라 넉넉히 잡되, 실수로 올린 거대 파일은 막는다.
const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8GB

const ALLOWED_PREFIX = "video/";

/** 우리 서비스 도메인에서 온 요청만 업로드 세션의 Origin 으로 인정한다. */
function allowedOrigin(raw: string | null): string | undefined {
  if (!raw) return undefined;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return undefined;
  }
  const ok =
    host === "deetz.kr" ||
    host === "www.deetz.kr" ||
    host === "dancers.bio" ||
    host === "www.dancers.bio" ||
    host === "localhost" ||
    host === "127.0.0.1";
  return ok ? raw : undefined;
}

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/webm": "webm",
};

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

    const body = (await req.json().catch(() => ({}))) as {
      contentType?: string;
      sizeBytes?: number;
    };
    const contentType = String(body.contentType ?? "").toLowerCase();
    const sizeBytes = Number(body.sizeBytes ?? 0);

    if (!contentType.startsWith(ALLOWED_PREFIX)) {
      return NextResponse.json(
        { ok: false, error: "영상 파일만 올릴 수 있습니다." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json({ ok: false, error: "파일 크기를 확인할 수 없습니다." }, { status: 400 });
    }
    if (sizeBytes > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "파일이 너무 큽니다. 8GB 이하로 올려 주세요." },
        { status: 400 },
      );
    }

    const folderId = process.env.GOOGLE_DRIVE_SUBMISSION_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { ok: false, error: "서버 설정이 누락되었습니다. 관리자에게 문의해 주세요." },
        { status: 500 },
      );
    }

    // 파일명은 전적으로 서버가 정한다. 지원자 입력을 쓰지 않는다.
    const ext = EXT_BY_TYPE[contentType] ?? "mp4";
    const fileName = `${sub.instagramHandle}.${ext}`;

    // 세션을 요청한 Origin 을 구글에 그대로 넘겨야 브라우저 직접 업로드가 CORS 를 통과한다.
    // 임의 Origin 이 들어오는 걸 막기 위해 우리 도메인만 허용한다.
    const origin = allowedOrigin(req.headers.get("origin"));

    const session = await createResumableSession({
      fileName,
      contentType,
      folderId,
      sizeBytes,
      origin,
    });

    return NextResponse.json({
      ok: true,
      uploadUrl: session.uploadUrl,
      fileName: session.fileName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "업로드를 시작하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

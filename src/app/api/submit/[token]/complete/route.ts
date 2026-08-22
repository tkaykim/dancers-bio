import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { loadSubmissionByToken, submissionAdminClient } from "@/lib/submissions/lookup";
import { localeFor } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/messages";
import { getDriveFile } from "@/lib/drive/resumable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const body = (await req.json().catch(() => ({}))) as { fileId?: string };
    const fileId = String(body.fileId ?? "").trim();
    if (!fileId) {
      return NextResponse.json(
        { ok: false, error: t(sub.locale, "submit.api.file_info_missing") },
        { status: 400 },
      );
    }

    // 브라우저가 보낸 fileId 를 믿지 않고, 서버가 Drive 에서 직접 조회해
    // 우리 제출 폴더에 실제로 들어온 파일인지 확인한다.
    const folderId = process.env.GOOGLE_DRIVE_SUBMISSION_FOLDER_ID;
    const meta = await getDriveFile(fileId);
    if (folderId && !(meta.parents ?? []).includes(folderId)) {
      return NextResponse.json(
        { ok: false, error: t(sub.locale, "submit.api.upload_location") },
        { status: 400 },
      );
    }

    const admin = submissionAdminClient();

    // 재업로드해도 이전 파일은 그대로 둔다(대표 지시 2026-08-14).
    // DB 의 drive_file_id 는 항상 최신 제출본을 가리키므로 최종본 판별은 여기서 한다.
    const { error } = await admin
      .from("project_submissions")
      .update({
        drive_file_id: meta.id,
        drive_file_name: meta.name,
        drive_web_link: meta.webViewLink ?? null,
        file_size_bytes: meta.size ?? null,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: t(sub.locale, "submit.api.record_failed") },
        { status: 500 },
      );
    }

    // 포기했다가 영상을 낸 경우, 제출 행위를 참여 의사로 보고 지원 상태를 되돌린다.
    // 이걸 안 하면 검수·정산 대상 집계에서 빠져 영상만 덩그러니 남는다.
    if (sub.applicationId && sub.applicationStatus && sub.applicationStatus !== "accepted") {
      await admin
        .from("applications")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", sub.applicationId);
    }

    return NextResponse.json({ ok: true, fileName: meta.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "제출을 마무리하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

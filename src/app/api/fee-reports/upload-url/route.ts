import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

// 제네릭 없는 service-role 클라이언트 (생성 Database 타입에 새 테이블/버킷이 없어도 동작)
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 증빙은 브라우저 → Supabase 스토리지 직접 업로드(서명 URL)로 처리.
// Vercel 서버리스 본문 한도(~4.5MB)를 우회 → 대용량·다수 첨부 가능.
const EVIDENCE_BUCKET = "fee-report-evidence";
const MAX_FILES = 50; // 사실상 무제한 — 폭주 방지 백스톱
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB/파일
const ALLOWED_EXT = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
  "pdf", "doc", "docx", "hwp", "hwpx", "txt", "rtf",
  "xls", "xlsx", "csv", "ppt", "pptx",
  "zip", "7z", "rar",
  "eml", "msg",
  "mp4", "mov", "m4v", "webm",
  "mp3", "m4a", "wav", "aac", "amr",
]);

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").slice(0, 120);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const incoming = Array.isArray(body.files) ? body.files : [];

    if (incoming.length === 0) {
      return NextResponse.json({ error: "no_files" }, { status: 400 });
    }
    if (incoming.length > MAX_FILES) {
      return NextResponse.json({ error: "too_many_files", max: MAX_FILES }, { status: 400 });
    }

    for (const f of incoming) {
      const name = typeof f?.name === "string" ? f.name : "";
      const size = typeof f?.size === "number" ? f.size : -1;
      if (!name || !ALLOWED_EXT.has(getExt(name))) {
        return NextResponse.json({ error: "file_type_not_allowed", name }, { status: 400 });
      }
      if (size < 0 || size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "file_too_large", name }, { status: 400 });
      }
    }

    const admin = adminClient();
    const reportId = randomUUID();

    const files = await Promise.all(
      incoming.map(async (f: { name: string }, i: number) => {
        const safe = sanitizeName(f.name);
        const path = `${reportId}/${String(i + 1).padStart(2, "0")}-${safe}`;
        const { data, error } = await admin.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUploadUrl(path);
        if (error || !data) {
          throw new Error(error?.message || "sign_failed");
        }
        return { path, token: data.token, name: safe };
      }),
    );

    return NextResponse.json({ report_id: reportId, files });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

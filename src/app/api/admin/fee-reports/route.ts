import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProfile, isSuperAdmin } from "@/lib/auth/guard";

// 제네릭 없는 service-role 클라이언트 (생성 Database 타입에 새 테이블/버킷이 없어도 동작)
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const EVIDENCE_BUCKET = "fee-report-evidence";
const SIGNED_URL_TTL = 60 * 60; // 1시간

type EvidenceFile = { path: string; name: string; size: number; type: string };

export async function GET() {
  const profile = await getProfile();
  if (!profile || !isSuperAdmin(profile)) {
    return NextResponse.json({ error: "슈퍼관리자만 실행할 수 있습니다." }, { status: 403 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("fee_payment_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fee_payment_reports list:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 비공개 버킷 증빙은 1시간 signed URL로 (관리자 인증 통과 후에만)
  const items = await Promise.all(
    (data ?? []).map(async (row: Record<string, unknown>) => {
      const evidence = Array.isArray(row.evidence_files)
        ? (row.evidence_files as EvidenceFile[])
        : [];
      const evidence_files = await Promise.all(
        evidence.map(async (f) => {
          const { data: signed } = await admin.storage
            .from(EVIDENCE_BUCKET)
            .createSignedUrl(f.path, SIGNED_URL_TTL);
          return { ...f, url: signed?.signedUrl ?? null };
        }),
      );
      return { ...row, evidence_files };
    }),
  );

  return NextResponse.json({ items });
}

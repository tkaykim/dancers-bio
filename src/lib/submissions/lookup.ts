import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 제네릭 없는 service-role 클라이언트 (생성 Database 타입에 새 테이블이 없어도 동작) */
export function submissionAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SubmissionContext {
  id: string;
  token: string;
  projectId: string;
  projectTitle: string;
  instagramHandle: string;
  displayName: string | null;
  uploadedAt: string | null;
  driveFileName: string | null;
  /** 업로드 가능 여부. false 면 reason 에 사유가 담긴다. */
  open: boolean;
  reason?: string;
}

/**
 * 제출 토큰 1개를 검증한다.
 *
 * 게이트가 세 겹이다.
 *  1) 토큰이 존재해야 한다 (추측 불가한 16자)
 *  2) revoked_at 이 없어야 한다 (마감 후 일괄 잠금용)
 *  3) 연결된 지원서가 accepted 여야 한다 — 지원만 한 사람은 못 올린다
 */
export async function loadSubmissionByToken(
  token: string,
): Promise<SubmissionContext | null> {
  if (!token || token.length < 8 || token.length > 64) return null;
  const admin = submissionAdminClient();

  const { data: sub } = await admin
    .from("project_submissions")
    .select(
      "id, token, project_id, application_id, instagram_handle, display_name, uploaded_at, drive_file_name, revoked_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (!sub) return null;

  const [{ data: project }, { data: application }] = await Promise.all([
    admin.from("projects").select("id, title, status").eq("id", sub.project_id).maybeSingle(),
    admin
      .from("applications")
      .select("id, status, archived_at")
      .eq("id", sub.application_id)
      .maybeSingle(),
  ]);

  const base: SubmissionContext = {
    id: sub.id as string,
    token: sub.token as string,
    projectId: sub.project_id as string,
    projectTitle: (project?.title as string) ?? "프로젝트",
    instagramHandle: sub.instagram_handle as string,
    displayName: (sub.display_name as string | null) ?? null,
    uploadedAt: (sub.uploaded_at as string | null) ?? null,
    driveFileName: (sub.drive_file_name as string | null) ?? null,
    open: true,
  };

  if (sub.revoked_at) {
    return { ...base, open: false, reason: "제출이 마감되었습니다." };
  }
  if (!application || application.archived_at) {
    return { ...base, open: false, reason: "지원 내역을 찾을 수 없습니다." };
  }
  if (application.status !== "accepted") {
    return {
      ...base,
      open: false,
      reason: "아직 참여가 확정되지 않았습니다. 확정 안내를 받으신 뒤 이용해 주세요.",
    };
  }
  return base;
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveLocale, type Locale } from "@/lib/i18n/locale";
import { acceptLanguage } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/messages";

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
  /** 제출자가 남긴 공동작업자 메모. 정산 근거가 아니다. */
  collaboratorHandles: string[];
  /** 업로드 가능 여부. false 면 reason 에 사유가 담긴다. */
  open: boolean;
  reason?: string;
  /** 연결된 지원서. 업로드 완료 시 포기 상태를 되돌리는 데 쓴다. */
  applicationId?: string;
  applicationStatus?: string;
  /** 공고 언어. reason 은 이미 이 언어로 번역돼 있고, 화면·API 도 이걸 따라간다. */
  locale: Locale;
}

/**
 * 제출 토큰 1개를 검증한다.
 *
 * 게이트가 세 겹이다.
 *  1) 토큰이 존재해야 한다 (추측 불가한 16자)
 *  2) revoked_at 이 없어야 한다 (마감 후 일괄 잠금용)
 *  3) 연결된 지원서가 확정(accepted) 또는 포기(declined·withdrawn) 여야 한다
 *     — 아직 확정 전(pending)인 사람은 못 올린다
 *
 * 포기했던 사람도 열어두는 이유(대표 지시 2026-08-22):
 *   마음이 바뀌어 참여하려는 사람에게 "다시 열어달라"고 회신하게 만들면
 *   그 왕복을 기다리다 마감을 놓친다. 제출 행위 자체를 참여 의사로 본다.
 *   업로드가 실제로 완료되면 complete 라우트가 지원 상태를 accepted 로 되돌린다.
 *
 * 차단 사유(reason)는 공고 언어로 번역해서 내보낸다. 영문 공고 참여자에게
 * 한국어 사유만 돌려주면 무엇이 막혔는지 알 수 없다.
 */
/** 업로드를 허용하는 지원 상태. pending 은 아직 확정 전이라 제외한다. */
const UPLOADABLE_STATUSES = new Set(["accepted", "declined", "withdrawn"]);
export async function loadSubmissionByToken(
  token: string,
): Promise<SubmissionContext | null> {
  if (!token || token.length < 8 || token.length > 64) return null;
  const admin = submissionAdminClient();

  const { data: sub } = await admin
    .from("project_submissions")
    .select(
      "id, token, project_id, application_id, instagram_handle, display_name, uploaded_at, drive_file_name, revoked_at, collaborator_handles",
    )
    .eq("token", token)
    .maybeSingle();

  if (!sub) return null;

  const [{ data: project }, { data: application }] = await Promise.all([
    admin
      .from("projects")
      .select("id, title, description, status")
      .eq("id", sub.project_id)
      .maybeSingle(),
    admin
      .from("applications")
      .select("id, status, archived_at")
      .eq("id", sub.application_id)
      .maybeSingle(),
  ]);

  const locale = resolveLocale({
    text: [project?.title as string | null, project?.description as string | null],
    acceptLanguage: await acceptLanguage(),
  });

  const base: SubmissionContext = {
    id: sub.id as string,
    token: sub.token as string,
    projectId: sub.project_id as string,
    projectTitle: (project?.title as string) ?? t(locale, "submit.fallback_project"),
    instagramHandle: sub.instagram_handle as string,
    displayName: (sub.display_name as string | null) ?? null,
    uploadedAt: (sub.uploaded_at as string | null) ?? null,
    driveFileName: (sub.drive_file_name as string | null) ?? null,
    collaboratorHandles: (sub.collaborator_handles as string[] | null) ?? [],
    open: true,
    applicationId: (sub.application_id as string | null) ?? undefined,
    locale,
  };

  if (sub.revoked_at) {
    return { ...base, open: false, reason: t(locale, "submit.blocked.revoked") };
  }
  if (!application || application.archived_at) {
    return { ...base, open: false, reason: t(locale, "submit.blocked.no_application") };
  }
  if (!UPLOADABLE_STATUSES.has(application.status as string)) {
    return {
      ...base,
      open: false,
      reason: t(locale, "submit.blocked.not_confirmed"),
    };
  }
  return { ...base, applicationId: application.id as string, applicationStatus: application.status as string };
}

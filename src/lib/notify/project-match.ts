import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

// 공고 공개 게시 시 → 장르가 맞는(승인+활성+계정연결) 댄서에게 인앱 + 웹푸시.
// after()로 응답 후 비동기 실행. 멱등 로그로 중복발송 방지. 절대 throw 하지 않음(부가기능).
export async function sendProjectMatchNotifications(projectId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: project } = await admin
      .from("projects")
      .select("id, title, short_code, status, visibility, deleted_at")
      .eq("id", projectId)
      .maybeSingle();
    if (!project || project.deleted_at) return;
    // 공개·모집중 공고만 발송 (임시저장/비공개 제외).
    if (project.status !== "open" || project.visibility !== "public") return;

    const { data: rows, error } = await admin.rpc("dancers_to_notify_for_project", {
      p_id: projectId,
    });
    if (error) {
      console.error("[project-match] rpc failed:", error.message);
      return;
    }
    const recipientIds = Array.from(
      new Set(
        ((rows ?? []) as Array<{ profile_id: string | null }>)
          .map((r) => r.profile_id)
          .filter((id): id is string => !!id),
      ),
    );
    if (recipientIds.length === 0) return;

    // 멱등: log upsert(ON CONFLICT DO NOTHING) 후 새로 들어간 수신자만 발송.
    const { data: inserted, error: logErr } = await admin
      .from("project_notification_log")
      .upsert(
        recipientIds.map((rid) => ({
          project_id: projectId,
          recipient_id: rid,
          channel: "match",
        })),
        { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
      )
      .select("recipient_id");
    if (logErr) {
      console.error("[project-match] log upsert failed:", logErr.message);
      return;
    }
    const fresh = ((inserted ?? []) as Array<{ recipient_id: string }>).map(
      (r) => r.recipient_id,
    );
    if (fresh.length === 0) return;

    const title = (project.title as string) || "새 공고";
    const shortCode = (project.short_code as string) || projectId;

    await Promise.allSettled(
      fresh.map((rid) =>
        notify({
          recipientId: rid,
          type: "project_posted_match",
          payload: {
            project_id: projectId,
            short_code: shortCode,
            project_title: title,
          },
          push: {
            title: "핏 맞는 새 공고가 올라왔어요",
            body: title,
            url: `/projects/${shortCode}`,
            tag: `project-${shortCode}`,
          },
        }),
      ),
    );
  } catch (e) {
    console.error("[project-match] failed (non-fatal):", e);
  }
}

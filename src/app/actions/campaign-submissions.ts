"use server";
import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { checked, db } from "@/lib/campaign/repository";
import {
  loadSubmissions,
  ownParticipants,
} from "@/lib/campaign/submission-repository";
import { participantView, submissionError } from "@/lib/campaign/submissions";
import { parseReelUrl } from "@/lib/instagram/handle";
import type { ActionResult } from "@/lib/campaign/types";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function mutateSubmissionAction(
  project: string,
  action: "configure" | "sync" | "participant" | "submit" | "review",
  input: Record<string, unknown>,
): Promise<ActionResult<Record<string, unknown>>> {
  const user = await requireUser();
  try {
    if (
      !uuid.test(project) ||
      !["configure", "sync", "participant", "submit", "review"].includes(action)
    )
      throw new Error("CAMPAIGN_DENIED");
    const staff = await canManageProject(project);
    if (action !== "submit" && !staff) throw new Error("CAMPAIGN_DENIED");
    if (
      !input ||
      typeof input !== "object" ||
      JSON.stringify(input).length > 20000
    )
      throw new Error("CAMPAIGN_INVALID_INPUT");
    const fields: Record<typeof action, string[]> = {
      configure: [
        "version",
        "enabled",
        "board_id",
        "deadline",
        "client_visible",
      ],
      sync: [],
      participant: [
        "participant_id",
        "version",
        "dancer_id",
        "owner_label",
        "deadline",
        "active",
        "note",
        "link_reason",
      ],
      submit: ["participant_id", "url", "replace_id", "version"],
      review: ["submission_id", "version", "status", "feedback", "checks"],
    };
    const data = Object.fromEntries(
      Object.entries(input).filter(([key]) => fields[action].includes(key)),
    );
    if (action === "submit") {
      if (
        !staff &&
        !(await ownParticipants(user.id)).some(
          (p) => p.id === data.participant_id && p.project_id === project,
        )
      )
        throw new Error("CAMPAIGN_DENIED");
      const parsed =
        typeof data.url === "string" ? parseReelUrl(data.url) : null;
      if (!parsed) throw new Error("CAMPAIGN_INVALID_URL");
      data.url = parsed.url;
      data.short_code = parsed.shortCode;
    }
    const result = checked(
      await db().rpc("campaign_submission_mutate", {
        p_project: project,
        p_actor: user.id,
        p_action: action,
        p_data: data,
      }),
    );
    revalidatePath(`/tools/campaigns/${project}`);
    revalidatePath("/applications");
    revalidatePath(`/campaigns/${project}/submit`);
    revalidatePath("/cast/[code]", "page");
    return { ok: true, data: result as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: submissionError(e) };
  }
}
export async function refreshSubmissionsAction(
  project: string,
  participantId?: string,
) {
  const user = await requireUser();
  if (!uuid.test(project)) throw new Error("권한이 없습니다.");
  if (await canManageProject(project)) return loadSubmissions(project);
  if (
    !participantId ||
    !(await ownParticipants(user.id)).some(
      (p) => p.id === participantId && p.project_id === project,
    )
  )
    throw new Error("권한이 없습니다.");
  return participantView(await loadSubmissions(project), participantId);
}
export async function submissionEventsAction(
  project: string,
  participantId: string,
) {
  await requireUser();
  if (
    !uuid.test(project) ||
    !uuid.test(participantId) ||
    !(await canManageProject(project))
  )
    throw new Error("권한이 없습니다.");
  return (
    checked(
      await db()
        .from("campaign_submission_events")
        .select("id,action,created_at,detail")
        .eq("project_id", project)
        .eq("participant_id", participantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ) ?? []
  );
}
export async function searchSubmissionMembersAction(
  project: string,
  query: string,
) {
  await requireUser();
  if (!uuid.test(project) || !(await canManageProject(project)))
    throw new Error("권한이 없습니다.");
  const q = query
    .trim()
    .replace(/[%_,()]/g, "")
    .slice(0, 60);
  if (q.length < 2) return [];
  return (
    checked(
      await db()
        .from("dancers")
        .select("id,stage_name,social_links")
        .not("profile_id", "is", null)
        .ilike("stage_name", `%${q}%`)
        .limit(20),
    ) ?? []
  );
}

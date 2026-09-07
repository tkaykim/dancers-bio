import "server-only";
import { checked, db, rows } from "./repository";
import {
  publicUploads,
  type Participant,
  type Submission,
  type SubmissionData,
  type SubmissionPost,
  type SubmissionSettings,
} from "./submissions";
export const PARTICIPANT_COLUMNS =
  "id,project_id,board_member_id,application_id,dancer_id,display_name,ig_handle,owner_label,deadline,active,note,version,manual_entry_id,client_visible";
export const SUBMISSION_COLUMNS =
  "id,project_id,participant_id,post_id,status,feedback,submitted_at,source,reviewed_at,replaced_at,version";
export async function submissionSettings(
  project: string,
): Promise<SubmissionSettings> {
  const r = await db()
    .from("campaign_submission_settings")
    .select("project_id,enabled,board_id,deadline,client_visible,version")
    .eq("project_id", project)
    .maybeSingle();
  // Additive rollout: the existing application remains readable before migration.
  if (r.error && !["42P01", "PGRST205"].includes(r.error.code)) checked(r);
  return (
    r.data ?? {
      project_id: project,
      enabled: false,
      board_id: null,
      deadline: null,
      client_visible: false,
      version: 0,
    }
  );
}
export async function loadSubmissions(
  project: string,
): Promise<SubmissionData> {
  const settings = await submissionSettings(project);
  if (!settings.version)
    return { settings, participants: [], submissions: [], posts: [] };
  const [participants, submissions, posts] = await Promise.all([
    rows<Participant>("campaign_participants", PARTICIPANT_COLUMNS, project),
    rows<Submission>("campaign_submissions", SUBMISSION_COLUMNS, project),
    rows<SubmissionPost>(
      "campaign_posts",
      "id,post_url,short_code,status",
      project,
    ),
  ]);
  return { settings, participants, submissions, posts };
}
export async function ownParticipants(userId: string): Promise<Participant[]> {
  const dancers = checked(
    await db().from("dancers").select("id").eq("profile_id", userId),
  );
  if (!dancers?.length) return [];
  const all: Participant[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await db()
      .from("campaign_participants")
      .select(PARTICIPANT_COLUMNS)
      .in(
        "dancer_id",
        dancers.map((d) => d.id),
      )
      .eq("active", true)
      .order("id")
      .range(offset, offset + 499);
    if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return [];
    const batch = checked(r) as Participant[];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  const verified: Participant[] = [];
  for (const p of all) {
    if (!(await submissionSettings(p.project_id)).enabled) continue;
    if (p.application_id) {
      const app = checked(
        await db()
          .from("applications")
          .select("id")
          .eq("id", p.application_id)
          .eq("project_id", p.project_id)
          .eq("dancer_id", p.dancer_id!)
          .eq("status", "accepted")
          .not("confirmed_at", "is", null)
          .is("archived_at", null)
          .maybeSingle(),
      );
      if (!app) continue;
    }
    verified.push(p);
  }
  return verified;
}
export async function boardUploads(project: string, boardId: string) {
  const settings = await submissionSettings(project);
  if (
    !settings.enabled ||
    !settings.client_visible ||
    settings.board_id !== boardId
  )
    return null;
  return publicUploads(await loadSubmissions(project));
}

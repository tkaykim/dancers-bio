import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EventOpsClient,
  type EventOpsEvent,
  type EventOpsParticipant,
  type EventOpsProject,
  type OutreachStatus,
} from "./EventOpsClient";

export const dynamic = "force-dynamic";

type RawParticipant = Omit<EventOpsParticipant, "dancer" | "channel"> & {
  dancer:
    | (EventOpsParticipant["dancer"] & {
        profile_id?: string | null;
      })
    | EventOpsParticipant["dancer"][]
    | null;
  channel:
    | EventOpsParticipant["channel"]
    | EventOpsParticipant["channel"][]
    | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const OUTREACH_STATUS_SET = new Set<OutreachStatus>([
  "pending",
  "no_answer",
  "unavailable",
  "available",
  "do_not_contact",
  "done",
]);

function toOutreachStatus(value: string | null | undefined): OutreachStatus {
  return OUTREACH_STATUS_SET.has(value as OutreachStatus)
    ? (value as OutreachStatus)
    : "pending";
}

export default async function ProjectEventOpsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const opsCode = (code ?? "").trim();
  if (!opsCode) notFound();

  const admin = createAdminClient();
  const { data: eventData } = await admin
    .from("project_events")
    .select(
      "id, project_id, ops_code, name, event_type, starts_at, ends_at, location, status, public_pass_code",
    )
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!eventData) notFound();
  const event = eventData as EventOpsEvent & { project_id: string };

  const [{ data: project }, { data: participantRows }] = await Promise.all([
    admin
      .from("projects")
      .select("title, short_code")
      .eq("id", event.project_id)
      .maybeSingle(),
    admin
      .from("event_participants")
      .select(
        `id, application_id, dancer_id, pass_token, bib_code, attendance_status, onsite_status, checked_in_at,
         eliminated_at, settlement_eligible, note, updated_at,
         dancer:dancers!event_participants_dancer_id_fkey (
           id, profile_id, stage_name, korean_name, slug, profile_img, gender, social_links
         ),
         channel:recruitment_channels!event_participants_recruitment_channel_id_fkey (
           name
         )`,
      )
      .eq("event_id", event.id)
      .order("bib_code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const participants = ((participantRows ?? []) as unknown as RawParticipant[]).map(
    (row) => ({
      ...row,
      dancer: one(row.dancer),
      channel: one(row.channel),
    }),
  ) as Array<EventOpsParticipant & { dancer_id: string }>;

  const dancerIds = Array.from(
    new Set(participants.map((row) => row.dancer_id).filter(Boolean)),
  );
  const profileIds = Array.from(
    new Set(
      participants
        .map((row) => row.dancer?.profile_id ?? null)
        .filter((value): value is string => !!value),
    ),
  );

  const [{ data: taskRows }, { data: privateRows }, { data: profileRows }] =
    await Promise.all([
      admin
        .from("outreach_tasks")
        .select(
          "id, dancer_id, application_id, status, contact_method, last_contacted_at, result_note, updated_at",
        )
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      dancerIds.length > 0
        ? admin
            .from("dancer_private_info")
            .select("dancer_id, phone, email")
            .in("dancer_id", dancerIds)
        : Promise.resolve({ data: [] }),
      profileIds.length > 0
        ? admin
            .from("profiles")
            .select("id, phone, instagram_handle")
            .in("id", profileIds)
        : Promise.resolve({ data: [] }),
    ]);

  const taskByDancerId = new Map(
    ((taskRows ?? []) as Array<{
      id: string;
      dancer_id: string | null;
      application_id: string | null;
      status: string;
      contact_method: string;
      last_contacted_at: string | null;
      result_note: string;
      updated_at: string;
    }>).map((task) => [task.dancer_id ?? task.application_id ?? task.id, task]),
  );
  const privateByDancerId = new Map(
    ((privateRows ?? []) as Array<{
      dancer_id: string;
      phone: string | null;
      email: string | null;
    }>).map((row) => [row.dancer_id, row]),
  );
  const profileById = new Map(
    ((profileRows ?? []) as Array<{
      id: string;
      phone: string | null;
      instagram_handle: string | null;
    }>).map((row) => [row.id, row]),
  );

  const enrichedParticipants: EventOpsParticipant[] = participants.map((row) => {
    const dancer = row.dancer;
    const profile = dancer?.profile_id ? profileById.get(dancer.profile_id) : null;
    const priv = privateByDancerId.get(row.dancer_id);
    const social = (dancer?.social_links ?? {}) as Record<string, string>;
    const task =
      taskByDancerId.get(row.dancer_id) ??
      taskByDancerId.get(row.application_id ?? "") ??
      null;

    return {
      ...row,
      outreach_task_id: task?.id ?? null,
      outreach_status: toOutreachStatus(task?.status),
      contact_method: task?.contact_method ?? "phone",
      last_contacted_at: task?.last_contacted_at ?? null,
      outreach_note: task?.result_note ?? "",
      contact_phone: priv?.phone ?? profile?.phone ?? null,
      contact_email: priv?.email ?? null,
      contact_instagram: profile?.instagram_handle ?? social.instagram ?? null,
    };
  });

  return (
    <EventOpsClient
      event={event}
      project={(project ?? null) as EventOpsProject | null}
      participants={enrichedParticipants}
    />
  );
}

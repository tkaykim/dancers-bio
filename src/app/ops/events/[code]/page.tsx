import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EventOpsClient,
  type EventOpsEvent,
  type EventOpsParticipant,
  type EventOpsProject,
} from "./EventOpsClient";

export const dynamic = "force-dynamic";

type RawParticipant = Omit<EventOpsParticipant, "dancer" | "channel"> & {
  dancer:
    | EventOpsParticipant["dancer"]
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
        `id, bib_code, attendance_status, onsite_status, checked_in_at,
         eliminated_at, settlement_eligible, note, updated_at,
         dancer:dancers!event_participants_dancer_id_fkey (
           id, stage_name, korean_name, slug, profile_img
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
  ) as EventOpsParticipant[];

  return (
    <EventOpsClient
      event={event}
      project={(project ?? null) as EventOpsProject | null}
      participants={participants}
    />
  );
}

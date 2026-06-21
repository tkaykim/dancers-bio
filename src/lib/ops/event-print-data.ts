import "server-only";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

type Relation<T> = T | T[] | null;

function one<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export type EventPrintEvent = {
  id: string;
  ops_code: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
};

export type EventPrintProject = {
  title: string | null;
  short_code: string | null;
};

export type EventPrintRow = {
  id: string;
  pass_token: string;
  bib_code: string | null;
  name: string;
  real_name: string | null;
  gender: string | null;
  channel_name: string | null;
};

type RawParticipant = {
  id: string;
  pass_token: string;
  bib_code: string | null;
  dancer:
    | {
        stage_name: string | null;
        korean_name: string | null;
        gender: string | null;
      }
    | Array<{
        stage_name: string | null;
        korean_name: string | null;
        gender: string | null;
      }>
    | null;
  channel:
    | {
        name: string | null;
      }
    | Array<{
        name: string | null;
      }>
    | null;
};

function bibSortValue(value: string | null) {
  if (!value) return 99999;
  const match = /^([A-Z])-([0-9]+)$/i.exec(value);
  if (!match) return 99998;
  return (match[1].toUpperCase().charCodeAt(0) - 65) * 100 + Number(match[2]);
}

export async function loadEventPrintData(opsCode: string) {
  const admin = createAdminClient();
  const { data: eventData } = await admin
    .from("project_events")
    .select("id, project_id, ops_code, name, starts_at, ends_at, location")
    .eq("ops_code", opsCode)
    .maybeSingle();

  if (!eventData) notFound();

  const event = eventData as EventPrintEvent & { project_id: string };
  const [{ data: projectData }, { data: participantRows }] = await Promise.all([
    admin
      .from("projects")
      .select("title, short_code")
      .eq("id", event.project_id)
      .maybeSingle(),
    admin
      .from("event_participants")
      .select(
        `id, pass_token, bib_code,
         dancer:dancers!event_participants_dancer_id_fkey (
           stage_name, korean_name, gender
         ),
         channel:recruitment_channels!event_participants_recruitment_channel_id_fkey (
           name
         )`,
      )
      .eq("event_id", event.id),
  ]);

  const rows = ((participantRows ?? []) as unknown as RawParticipant[])
    .map((row) => {
      const dancer = one(row.dancer);
      const channel = one(row.channel);
      return {
        id: row.id,
        pass_token: row.pass_token,
        bib_code: row.bib_code,
        name: dancer?.stage_name ?? dancer?.korean_name ?? "이름 없음",
        real_name: dancer?.korean_name ?? null,
        gender: dancer?.gender ?? null,
        channel_name: channel?.name ?? null,
      };
    })
    .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));

  return {
    event,
    project: (projectData ?? null) as EventPrintProject | null,
    rows,
  };
}

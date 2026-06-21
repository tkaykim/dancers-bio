import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventSelfPassClient } from "./EventSelfPassClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "현장 접수 QR · deetz",
  robots: { index: false, follow: false },
};

export default async function EventSelfPassPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const opsCode = (code ?? "").trim();

  const admin = createAdminClient();
  const { data: eventData } = await admin
    .from("project_events")
    .select("ops_code, name, project_id")
    .eq("ops_code", opsCode)
    .maybeSingle();

  let eventLabel = "현장 접수";
  if (eventData) {
    const event = eventData as { name: string | null; project_id: string };
    const { data: projectData } = await admin
      .from("projects")
      .select("title")
      .eq("id", event.project_id)
      .maybeSingle();
    eventLabel =
      (projectData as { title: string | null } | null)?.title ??
      event.name ??
      "현장 접수";
  }

  return <EventSelfPassClient opsCode={opsCode} eventLabel={eventLabel} />;
}

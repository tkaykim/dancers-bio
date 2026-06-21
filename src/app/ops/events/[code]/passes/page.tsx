import { loadEventPrintData } from "@/lib/ops/event-print-data";
import { EventPassesClient } from "./EventPassesClient";

export const dynamic = "force-dynamic";

export default async function EventPassesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await loadEventPrintData((code ?? "").trim());

  return (
    <EventPassesClient
      event={data.event}
      project={data.project}
      rows={data.rows}
    />
  );
}

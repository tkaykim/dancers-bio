import { loadEventPrintData } from "@/lib/ops/event-print-data";
import { EventLabelsClient } from "./EventLabelsClient";

export const dynamic = "force-dynamic";

export default async function EventLabelsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await loadEventPrintData((code ?? "").trim());

  return (
    <EventLabelsClient
      event={data.event}
      project={data.project}
      rows={data.rows}
    />
  );
}

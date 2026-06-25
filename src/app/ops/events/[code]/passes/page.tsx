import { loadEventPrintData } from "@/lib/ops/event-print-data";
import { requireEventOpsAccess } from "@/lib/ops/event-access";
import { EventPassesClient } from "./EventPassesClient";

export const dynamic = "force-dynamic";

export default async function EventPassesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const opsCode = (code ?? "").trim();
  // staff-facing 인쇄 뷰도 콘솔과 동일 인증 게이트.
  await requireEventOpsAccess(opsCode);
  const data = await loadEventPrintData(opsCode);

  return (
    <EventPassesClient
      event={data.event}
      project={data.project}
      rows={data.rows}
    />
  );
}

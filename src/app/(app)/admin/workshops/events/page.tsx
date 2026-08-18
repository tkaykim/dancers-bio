import { notFound } from "next/navigation";

import { EventsAdminShell } from "@/components/admin/EventsAdminShell";
import { requireProfile } from "@/lib/auth/guard";
import { getAdminEventDetail, listAdminEvents } from "@/lib/workshops/event-queries";

// 행사 관리 — 행사 생성·수정, 세션 편집, 세션별 신청 현황(정원은 여기서만 보인다), 주문 관리.

export const dynamic = "force-dynamic";
export const metadata = { title: "행사 관리 | deetz admin" };

export default async function AdminWorkshopEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const events = await listAdminEvents();
  const sp = await searchParams;
  const selectedId = sp.event ?? events[0]?.id ?? null;
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const detail = selected ? await getAdminEventDetail(selected.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">행사 관리</h1>
        <p className="mt-1 text-sm text-ink-3">
          행사를 직접 만들고 세션·정원·가격을 관리합니다. 정원 숫자는 이 화면에서만 보입니다.
        </p>
      </div>
      <EventsAdminShell
        events={events}
        selected={selected}
        sessions={detail?.sessions ?? []}
        orders={detail?.orders ?? []}
      />
    </div>
  );
}

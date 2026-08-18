import Link from "next/link";
import { notFound } from "next/navigation";

import { EventAdminConsole } from "@/components/admin/EventAdminConsole";
import { requireProfile } from "@/lib/auth/guard";
import { getAdminEventDetail, listAdminEvents } from "@/lib/workshops/event-queries";

// 행사 관리 — 세션별 신청 현황(정원은 여기서만 보인다)과 주문 목록.
// 행사 생성·세션 편집은 v1에선 시드/SQL로 하고, 콘솔은 운영(현황·상태 처리)에 집중한다.

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
  const detail = selectedId ? await getAdminEventDetail(selectedId) : null;
  const selected = events.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">행사 관리</h1>
        <p className="mt-1 text-sm text-ink-3">
          개설 행사의 세션별 신청 현황과 주문을 관리합니다. 정원 숫자는 이 화면에서만 보입니다.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 개설된 행사가 없습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/admin/workshops/events?event=${e.id}`}
                className={
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors " +
                  (e.id === selectedId
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-hairline-2 text-ink-2 hover:text-foreground")
                }
              >
                {e.title} · {e.starts_on}
              </Link>
            ))}
          </div>

          {selected && detail ? (
            <EventAdminConsole event={selected} sessions={detail.sessions} orders={detail.orders} />
          ) : null}
        </>
      )}
    </div>
  );
}

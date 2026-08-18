"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { AddSessionButton, EventEditor, SessionEditor } from "@/components/admin/EventEditor";
import { EventAdminConsole } from "@/components/admin/EventAdminConsole";
import type { AdminEventListRow, AdminEventOrder, AdminEventSession } from "@/lib/workshops/event-queries";

// 행사 관리 셸 — 행사 만들기 / 행사 정보 수정 / 세션 편집 / 운영 콘솔을 한 화면에.

export function EventsAdminShell({
  events,
  selected,
  sessions,
  orders,
}: {
  events: AdminEventListRow[];
  selected: AdminEventListRow | null;
  sessions: AdminEventSession[];
  orders: AdminEventOrder[];
}) {
  const [showNew, setShowNew] = useState(events.length === 0);
  const [showEdit, setShowEdit] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/admin/workshops/events?event=${e.id}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              e.id === selected?.id
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-hairline-2 text-ink-2 hover:text-foreground",
            )}
          >
            {e.title} · {e.starts_on}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline-2 px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-foreground"
        >
          <Plus className="size-3.5" /> 새 행사
        </button>
      </div>

      {showNew ? <EventEditor event={null} onDone={() => setShowNew(false)} /> : null}

      {selected ? (
        <>
          {/* 행사 정보 수정 (접이식) */}
          <div className="overflow-hidden rounded-xl border border-hairline-2 bg-card">
            <button
              type="button"
              onClick={() => setShowEdit((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[13px] font-bold text-foreground">
                행사 정보 수정 — {selected.title}
                <span className="ml-2 font-normal text-ink-3">
                  {selected.country_code ?? "?"} {selected.city ?? ""} · {selected.currency} · {selected.status}
                </span>
              </span>
              <ChevronDown className={cn("size-4 text-ink-3 transition-transform", showEdit && "rotate-180")} />
            </button>
            {showEdit ? (
              <div className="border-t border-hairline-2 p-4">
                <EventEditor event={selected} onDone={() => setShowEdit(false)} />
              </div>
            ) : null}
          </div>

          {/* 세션 편집 */}
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] font-bold text-foreground">세션 (클래스)</p>
            {sessions.map((s) =>
              editingSession === s.id ? (
                <SessionEditor
                  key={s.id}
                  eventId={selected.id}
                  eventCurrency={selected.currency}
                  session={s}
                  defaultDate={selected.starts_on}
                  onDone={() => setEditingSession(null)}
                />
              ) : (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditingSession(s.id)}
                  className="flex items-center justify-between rounded-lg border border-hairline-2 bg-card px-4 py-2.5 text-left text-[13px] transition-colors hover:border-foreground/40"
                >
                  <span>
                    <b>{s.title}</b>
                    <span className="text-ink-3">
                      {" "}
                      · {s.session_date} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.instructor_name}
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-4">편집</span>
                </button>
              ),
            )}
            <AddSessionButton
              eventId={selected.id}
              eventCurrency={selected.currency}
              defaultDate={selected.starts_on}
            />
          </div>

          <EventAdminConsole event={selected} sessions={sessions} orders={orders} />
        </>
      ) : null}
    </div>
  );
}

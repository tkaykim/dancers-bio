import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicEvent, PublicEventSession } from "@/lib/workshops/event-shared";

// 행사 공개 조회.
// ⚠️ 정원 은닉이 이 파일의 존재 이유다 — 세션의 capacity 는 여기서만 읽고,
//    공개 타입으로 변환할 때 "is_closed" 불리언으로 바꿔서 숫자를 절대 응답에 싣지 않는다.

const EVENT_COLUMNS =
  "id, slug, title, subtitle, description, poster_url, country_code, city, currency, venue_name, venue_address, venue_map_url, timezone, starts_on, ends_on, apply_deadline, status, default_lang";

type SessionRow = PublicEventSession & { capacity: number; status: "open" | "closed" | "hidden" };

async function loadSessions(eventId: string): Promise<SessionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_event_sessions")
    .select(
      "id, sort, session_date, start_time, end_time, title, instructor_name, instructor_instagram, instructor_image_url, dancer_slug, level, capacity, price_local, price_krw, price_usd, venue_override, status",
    )
    .eq("event_id", eventId)
    .neq("status", "hidden")
    .order("session_date")
    .order("start_time");
  return (data ?? []) as unknown as SessionRow[];
}

/** 세션별 활성 좌석 수(결제완료 + 살아있는 홀드) — 관리자·마감 판정 공용. */
async function loadActiveSeatCounts(eventId: string): Promise<Map<string, number>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_event_registrations")
    .select("session_id, status, workshop_event_orders!inner(status, expires_at)")
    .eq("event_id", eventId)
    .neq("status", "cancelled");
  const map = new Map<string, number>();
  const now = Date.now();
  for (const row of (data ?? []) as unknown as {
    session_id: string;
    workshop_event_orders: { status: string; expires_at: string | null };
  }[]) {
    const o = row.workshop_event_orders;
    const alive =
      o.status === "paid" ||
      (o.status === "pending" && (!o.expires_at || new Date(o.expires_at).getTime() > now));
    if (alive) map.set(row.session_id, (map.get(row.session_id) ?? 0) + 1);
  }
  return map;
}

export async function getPublicEventBySlug(
  slug: string,
): Promise<{ event: PublicEvent; sessions: PublicEventSession[] } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .in("status", ["open", "closed", "completed"])
    .maybeSingle();
  if (!data) return null;
  const event = data as PublicEvent;

  const [rows, counts] = await Promise.all([loadSessions(event.id), loadActiveSeatCounts(event.id)]);

  const sessions: PublicEventSession[] = rows.map((s) => ({
    id: s.id,
    sort: s.sort,
    session_date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    title: s.title,
    instructor_name: s.instructor_name,
    instructor_instagram: s.instructor_instagram,
    instructor_image_url: s.instructor_image_url,
    dancer_slug: s.dancer_slug,
    level: s.level,
    price_local: s.price_local === null ? null : Number(s.price_local),
    price_krw: s.price_krw,
    price_usd: s.price_usd === null ? null : Number(s.price_usd),
    venue_override: s.venue_override,
    // capacity 는 여기서 소멸한다 — 공개 응답엔 마감 여부만.
    is_closed: s.status === "closed" || (counts.get(s.id) ?? 0) >= s.capacity,
  }));

  return { event, sessions };
}

/** 랜딩 "열린 워크샵" 섹션용 — open 행사만, 가까운 날짜순. */
export type OpenEventCard = Pick<
  PublicEvent,
  "slug" | "title" | "subtitle" | "poster_url" | "venue_name" | "starts_on" | "ends_on"
> & { session_count: number };

export async function listOpenEvents(limit = 6): Promise<OpenEventCard[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_events")
    .select("id, slug, title, subtitle, poster_url, venue_name, starts_on, ends_on")
    .eq("status", "open")
    .order("starts_on")
    .limit(limit);
  const events = (data ?? []) as (OpenEventCard & { id: string })[];
  if (events.length === 0) return [];
  const { data: sess } = await admin
    .from("workshop_event_sessions")
    .select("event_id")
    .in(
      "event_id",
      events.map((e) => e.id),
    )
    .neq("status", "hidden");
  const counts = new Map<string, number>();
  for (const s of sess ?? []) {
    counts.set(s.event_id as string, (counts.get(s.event_id as string) ?? 0) + 1);
  }
  return events.map(({ id, ...e }) => ({ ...e, session_count: counts.get(id) ?? 0 }));
}

// ── 어드민 ─────────────────────────────────────────────────────────────────

export type AdminEventSession = SessionRow & { active_count: number; paid_count: number };
export type AdminEventOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  amount_krw: number;
  charged_currency: string | null;
  charged_amount: number | null;
  status: string;
  pg_provider: string | null;
  paid_at: string | null;
  created_at: string;
  session_ids: string[];
};

export async function getAdminEventDetail(eventId: string): Promise<{
  sessions: AdminEventSession[];
  orders: AdminEventOrder[];
}> {
  const admin = createAdminClient();
  const [rows, counts, ordersRes, regsRes] = await Promise.all([
    loadSessions(eventId),
    loadActiveSeatCounts(eventId),
    admin
      .from("workshop_event_orders")
      .select(
        "id, order_no, customer_name, customer_email, customer_phone, amount_krw, charged_currency, charged_amount, status, pg_provider, paid_at, created_at",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("workshop_event_registrations")
      .select("order_id, session_id, status, workshop_event_orders!inner(status)")
      .eq("event_id", eventId),
  ]);

  const paidCounts = new Map<string, number>();
  const orderSessions = new Map<string, string[]>();
  for (const r of (regsRes.data ?? []) as unknown as {
    order_id: string;
    session_id: string;
    status: string;
    workshop_event_orders: { status: string };
  }[]) {
    const list = orderSessions.get(r.order_id) ?? [];
    list.push(r.session_id);
    orderSessions.set(r.order_id, list);
    if (r.workshop_event_orders.status === "paid" && r.status !== "cancelled") {
      paidCounts.set(r.session_id, (paidCounts.get(r.session_id) ?? 0) + 1);
    }
  }

  return {
    sessions: rows.map((s) => ({
      ...s,
      price_local: s.price_local === null ? null : Number(s.price_local),
      price_usd: s.price_usd === null ? null : Number(s.price_usd),
      active_count: counts.get(s.id) ?? 0,
      paid_count: paidCounts.get(s.id) ?? 0,
    })),
    orders: ((ordersRes.data ?? []) as unknown as Omit<AdminEventOrder, "session_ids">[]).map((o) => ({
      ...o,
      charged_amount: o.charged_amount === null ? null : Number(o.charged_amount),
      session_ids: orderSessions.get(o.id) ?? [],
    })),
  };
}

export type AdminEventListRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  poster_url: string | null;
  country_code: string | null;
  city: string | null;
  currency: string;
  status: string;
  starts_on: string;
  ends_on: string;
  apply_deadline: string | null;
  timezone: string;
  default_lang: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
};

export async function listAdminEvents(): Promise<AdminEventListRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workshop_events")
    .select(
      "id, slug, title, subtitle, description, poster_url, country_code, city, currency, status, starts_on, ends_on, apply_deadline, timezone, default_lang, venue_name, venue_address, venue_map_url",
    )
    .order("starts_on", { ascending: false })
    .limit(100);
  return (data ?? []) as AdminEventListRow[];
}

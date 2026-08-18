-- deetz Workshops — 실제 개설 행사(Event·Session·주문·신청) (대표 지시 2026-08-18, 방콕 11/18 첫 행사)
--
-- 구조: 행사(우산: 장소·기간) → 세션(수업 1칸: 날짜·시간·강사·정원·가격) → 주문(결제 단위) → 신청(세션 좌석 단위).
-- ⚠️ 정원(capacity)은 신청자에게 절대 노출하지 않는다 — 서버 응답에 싣지 않고 "마감" 불리언만 내려보낸다.
--    그래서 공개 조회도 anon 정책을 열지 않고 service-role + 명시적 컬럼 선택으로 간다(컬럼 단위 은닉).
-- 결제: 세션별 3통화 가격(₩/฿/$)을 명시 저장 — 환율 계산 없이 깔끔한 숫자로 청구한다.
--       PayPal 은 THB 우선, 계정이 거부하면 USD 폴백(기존 KRW→USD 폴백 패턴).

create table if not exists public.workshop_events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  poster_url text,
  venue_name text,
  venue_address text,
  venue_map_url text,
  timezone text not null default 'Asia/Seoul',
  starts_on date not null,
  ends_on date not null,
  apply_deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft','open','closed','completed','cancelled')),
  default_lang text not null default 'ko' check (default_lang in ('ko','en','ja')),
  source_artist_id uuid references public.workshop_artists(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workshop_events enable row level security;
revoke all on table public.workshop_events from anon, authenticated;
comment on table public.workshop_events is
  'deetz 워크샵 행사(우산). RLS default-deny(service-role 전용) — 공개 렌더는 서버 컴포넌트가 명시 컬럼으로 읽는다.';

create table if not exists public.workshop_event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workshop_events(id) on delete cascade,
  sort integer not null default 0,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  instructor_name text not null,
  instructor_instagram text,
  instructor_image_url text,
  dancer_slug text,
  level text,
  capacity integer not null default 30 check (capacity > 0),
  price_krw integer not null check (price_krw >= 0),
  price_thb numeric(10,2),
  price_usd numeric(10,2),
  venue_override text,
  status text not null default 'open' check (status in ('open','closed','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_event_sessions_event_idx
  on public.workshop_event_sessions (event_id, session_date, start_time);

alter table public.workshop_event_sessions enable row level security;
revoke all on table public.workshop_event_sessions from anon, authenticated;
comment on table public.workshop_event_sessions is
  '행사 세션(수업 1칸). capacity 는 관리자 전용 — 공개 응답에 절대 포함 금지. RLS default-deny.';

create table if not exists public.workshop_event_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workshop_events(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  amount_krw integer not null check (amount_krw >= 0),
  amount_thb numeric(10,2),
  amount_usd numeric(10,2),
  charged_currency text,
  charged_amount numeric(12,2),
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled','refunded','recovery_required')),
  pg_provider text check (pg_provider is null or pg_provider in ('toss','paypal')),
  order_no text not null unique,
  pg_order_id text unique,
  payment_key text,
  receipt_url text,
  paid_at timestamptz,
  failure_reason text,
  refunded_at timestamptz,
  expires_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  lang text not null default 'en',
  memo text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_event_orders_event_idx
  on public.workshop_event_orders (event_id, status);
create index if not exists workshop_event_orders_user_idx
  on public.workshop_event_orders (user_id, status);

alter table public.workshop_event_orders enable row level security;
revoke all on table public.workshop_event_orders from anon, authenticated;
comment on table public.workshop_event_orders is
  '행사 신청 주문(결제 단위, 여러 세션 묶음). 3통화 금액 명시(₩/฿/$), PayPal=THB 우선 USD 폴백, Toss=KRW. RLS default-deny.';

create table if not exists public.workshop_event_registrations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.workshop_event_orders(id) on delete cascade,
  event_id uuid not null references public.workshop_events(id) on delete restrict,
  session_id uuid not null references public.workshop_event_sessions(id) on delete restrict,
  email text not null,
  status text not null default 'active'
    check (status in ('active','cancelled','attended','no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, session_id)
);

create index if not exists workshop_event_regs_session_idx
  on public.workshop_event_registrations (session_id, status);

alter table public.workshop_event_registrations enable row level security;
revoke all on table public.workshop_event_registrations from anon, authenticated;
comment on table public.workshop_event_registrations is
  '세션 좌석 1건. 주문(order) 상태가 결제 정본이고, 이 행의 status 는 출석 관리용. RLS default-deny.';

-- ── 좌석 확보(원자) — 예약금의 reserve_workshop_seat 패턴을 행사용으로 확장 ──
-- 홀드(pending, expires_at) 포함해 정원을 세고, 이메일로 같은 세션 중복 신청을 막는다.
create or replace function public.reserve_event_seats(
  p_event_id uuid,
  p_session_ids uuid[],
  p_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_order_no text,
  p_terms_version text,
  p_lang text default 'en',
  p_hold_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ev public.workshop_events%rowtype;
  s public.workshop_event_sessions%rowtype;
  sid uuid;
  taken integer;
  dup integer;
  total_krw integer := 0;
  total_thb numeric := 0;
  total_usd numeric := 0;
  has_thb boolean := true;
  has_usd boolean := true;
  new_order uuid;
  hold_until timestamptz;
  norm_email text := lower(trim(p_email));
begin
  if p_session_ids is null or array_length(p_session_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'NO_SESSIONS');
  end if;

  select * into ev from public.workshop_events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if ev.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'NOT_OPEN');
  end if;
  if ev.apply_deadline is not null and ev.apply_deadline < now() then
    return jsonb_build_object('ok', false, 'error', 'DEADLINE');
  end if;

  hold_until := now() + make_interval(mins => greatest(p_hold_minutes, 5));

  -- 만료된 홀드 정리(좌석 반환)
  update public.workshop_event_orders
     set status = 'cancelled',
         failure_reason = coalesce(failure_reason, 'hold_expired'),
         updated_at = now()
   where event_id = p_event_id
     and status = 'pending'
     and expires_at is not null
     and expires_at < now();

  foreach sid in array p_session_ids loop
    select * into s from public.workshop_event_sessions
     where id = sid and event_id = p_event_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'BAD_SESSION');
    end if;
    if s.status <> 'open' then
      return jsonb_build_object('ok', false, 'error', 'SESSION_CLOSED', 'session', s.title);
    end if;

    -- 같은 이메일이 같은 세션에 이미 신청(살아있는 주문)했으면 중복
    select count(*) into dup
      from public.workshop_event_registrations r
      join public.workshop_event_orders o on o.id = r.order_id
     where r.session_id = sid
       and r.status <> 'cancelled'
       and lower(r.email) = norm_email
       and (o.status = 'paid'
            or (o.status = 'pending' and (o.expires_at is null or o.expires_at > now())));
    if dup > 0 then
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE', 'session', s.title);
    end if;

    -- 정원: 결제완료 + 살아있는 홀드
    select count(*) into taken
      from public.workshop_event_registrations r
      join public.workshop_event_orders o on o.id = r.order_id
     where r.session_id = sid
       and r.status <> 'cancelled'
       and (o.status = 'paid'
            or (o.status = 'pending' and (o.expires_at is null or o.expires_at > now())));
    if taken >= s.capacity then
      return jsonb_build_object('ok', false, 'error', 'FULL', 'session', s.title);
    end if;

    total_krw := total_krw + s.price_krw;
    if s.price_thb is null then has_thb := false; else total_thb := total_thb + s.price_thb; end if;
    if s.price_usd is null then has_usd := false; else total_usd := total_usd + s.price_usd; end if;
  end loop;

  insert into public.workshop_event_orders
    (event_id, user_id, customer_name, customer_email, customer_phone,
     amount_krw, amount_thb, amount_usd,
     status, order_no, pg_order_id, expires_at, terms_version, terms_accepted_at, lang)
  values
    (p_event_id, p_user_id, p_name, norm_email, nullif(trim(coalesce(p_phone,'')),''),
     total_krw, case when has_thb then total_thb end, case when has_usd then total_usd end,
     'pending', p_order_no, p_order_no, hold_until, p_terms_version, now(), p_lang)
  returning id into new_order;

  insert into public.workshop_event_registrations (order_id, event_id, session_id, email)
  select new_order, p_event_id, sid2, norm_email
  from unnest(p_session_ids) as sid2;

  return jsonb_build_object('ok', true, 'order_id', new_order, 'order_no', p_order_no,
                            'amount_krw', total_krw,
                            'amount_thb', case when has_thb then total_thb end,
                            'amount_usd', case when has_usd then total_usd end,
                            'session_count', array_length(p_session_ids, 1));
end;
$$;

revoke all on function public.reserve_event_seats(uuid, uuid[], uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;

-- ── 결제 확정(원자, 예약금 mark_workshop_reservation_paid 와 동일 계약) ──
create or replace function public.mark_event_order_paid(
  p_order_id uuid,
  p_provider text,
  p_payment_key text,
  p_receipt_url text,
  p_raw jsonb,
  p_charged_currency text,
  p_charged_amount numeric
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cur public.workshop_event_orders%rowtype;
begin
  select * into cur from public.workshop_event_orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;
  if cur.status in ('paid', 'refunded', 'recovery_required') then
    return 'already_recorded';
  end if;
  if cur.status = 'pending' then
    update public.workshop_event_orders
       set status = 'paid', pg_provider = p_provider, payment_key = p_payment_key,
           receipt_url = p_receipt_url, raw = p_raw,
           charged_currency = p_charged_currency, charged_amount = p_charged_amount,
           paid_at = now(), failure_reason = null, expires_at = null, updated_at = now()
     where id = p_order_id;
    return 'recorded';
  end if;
  -- cancelled(홀드 만료 등)에 늦은 승인 — 돈은 기록하되 자동 복귀시키지 않는다.
  update public.workshop_event_orders
     set status = 'recovery_required', pg_provider = p_provider, payment_key = p_payment_key,
         receipt_url = p_receipt_url, raw = p_raw,
         charged_currency = p_charged_currency, charged_amount = p_charged_amount,
         paid_at = now(),
         memo = concat_ws(' | ', nullif(memo, ''), 'AUTO: 취소/만료 주문에 결제 승인 도착 — 확인 필요'),
         updated_at = now()
   where id = p_order_id;
  return 'recovery_required';
end;
$$;

revoke all on function public.mark_event_order_paid(uuid, text, text, text, jsonb, text, numeric) from public, anon, authenticated;

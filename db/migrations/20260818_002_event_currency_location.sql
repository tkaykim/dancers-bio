-- deetz Workshops 행사 — 지역·통화 일반화 (대표 지시 2026-08-18)
--
-- 통화 원칙(확정):
--   · 행사마다 "행사 통화" 1개 — 개최 국가의 통화로 가격을 보여주고 그 통화로 PayPal 청구.
--   · PayPal 미지원 통화면 USD 폴백(price_usd). 자동 환산은 하지 않는다 — 통화별 명시 가격.
--   · Toss(한국 카드·계좌)는 KRW 가격(price_krw)을 넣은 행사에서만 노출된다(이제 nullable).
-- 지역: 국가(ISO2)·도시를 행사에 저장 — 수요 데이터의 country/city 와 같은 축으로 분석 가능.

alter table public.workshop_events
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists currency text not null default 'KRW';

comment on column public.workshop_events.currency is
  '행사 통화(참가자 표시·PayPal 청구). PayPal 미지원 통화면 세션 price_usd 로 폴백. KRW 청구는 Toss.';

-- 세션: 행사 통화 가격(price_local) 신설, KRW 는 옵션으로 완화
alter table public.workshop_event_sessions
  add column if not exists price_local numeric(12,2);

alter table public.workshop_event_sessions
  alter column price_krw drop not null;

comment on column public.workshop_event_sessions.price_local is
  '행사 통화(workshop_events.currency) 기준 가격. 참가자에게 보이는 정본 가격.';
comment on column public.workshop_event_sessions.price_krw is
  'Toss(한국 카드·계좌)용 원화 가격. 비우면 해당 행사에서 Toss 결제 옵션이 숨는다.';

-- 주문: 행사 통화 합계
alter table public.workshop_event_orders
  add column if not exists currency text,
  add column if not exists amount_local numeric(12,2);

alter table public.workshop_event_orders
  alter column amount_krw drop not null;

-- ── 방콕 행사 백필 ──────────────────────────────────────────────────────────
update public.workshop_events
   set country_code = 'TH', city = 'Bangkok', currency = 'THB', updated_at = now()
 where slug = 'bangkok-nov18';

update public.workshop_event_sessions s
   set price_local = s.price_thb, updated_at = now()
  from public.workshop_events e
 where e.id = s.event_id and e.slug = 'bangkok-nov18' and s.price_local is null;

-- ── 좌석 확보 함수 갱신 — 행사 통화 합계 + KRW/USD 는 있을 때만 ─────────────
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
  total_local numeric := 0;
  total_krw integer := 0;
  total_usd numeric := 0;
  has_local boolean := true;
  has_krw boolean := true;
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

    if s.price_local is null then has_local := false; else total_local := total_local + s.price_local; end if;
    if s.price_krw is null then has_krw := false; else total_krw := total_krw + s.price_krw; end if;
    if s.price_usd is null then has_usd := false; else total_usd := total_usd + s.price_usd; end if;
  end loop;

  -- 가격 정본이 하나도 없으면 결제 불가
  if not has_local and not has_krw then
    return jsonb_build_object('ok', false, 'error', 'NO_PRICE');
  end if;

  insert into public.workshop_event_orders
    (event_id, user_id, customer_name, customer_email, customer_phone,
     currency, amount_local, amount_krw, amount_usd,
     status, order_no, pg_order_id, expires_at, terms_version, terms_accepted_at, lang)
  values
    (p_event_id, p_user_id, p_name, norm_email, nullif(trim(coalesce(p_phone,'')),''),
     ev.currency,
     case when has_local then total_local end,
     case when has_krw then total_krw end,
     case when has_usd then total_usd end,
     'pending', p_order_no, p_order_no, hold_until, p_terms_version, now(), p_lang)
  returning id into new_order;

  insert into public.workshop_event_registrations (order_id, event_id, session_id, email)
  select new_order, p_event_id, sid2, norm_email
  from unnest(p_session_ids) as sid2;

  return jsonb_build_object('ok', true, 'order_id', new_order, 'order_no', p_order_no,
                            'currency', ev.currency,
                            'amount_local', case when has_local then total_local end,
                            'amount_krw', case when has_krw then total_krw end,
                            'amount_usd', case when has_usd then total_usd end,
                            'session_count', array_length(p_session_ids, 1));
end;
$$;

revoke all on function public.reserve_event_seats(uuid, uuid[], uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;

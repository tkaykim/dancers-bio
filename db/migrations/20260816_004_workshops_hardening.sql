-- deetz Workshops 보강 (Codex 교차검토 반영, 2026-08-16)
--
-- 1) 공개 카드 조회를 service-role → anon+RLS 로 내린다.
--    기존엔 공개 페이지도 service-role 로 읽어서 코드에서 상태 필터를 빠뜨리면 비공개 제안이 노출됐다.
--    이제 DB가 막는다(운영 편의는 그대로, 방어선만 추가).
-- 2) 좌석 확보를 DB 함수 1개로 원자화 — 정원 초과·금액 변경 중 결제·만료 pending 정리를 한 트랜잭션에서 처리.
-- 3) 결제 승인(pending→paid)을 원자적 전이로 만들어 동시 요청에서도 메일이 한 번만 나가게 한다.
-- 4) 예약금 고지 동의 시각·문구 버전을 기록한다(전자상거래 분쟁 대비).

-- ── 컬럼 추가 ──────────────────────────────────────────────────────────────
alter table public.workshop_reservations
  add column if not exists expires_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.workshop_reservations.expires_at is
  '결제 대기(pending) 좌석 홀드 만료. 지나면 좌석을 반환하고 새 주문번호를 발급한다.';
comment on column public.workshop_reservations.terms_version is
  '예약자가 동의한 예약금·환불 고지 문구 버전(components/workshops/copy.ts POLICY_VERSION).';

-- ── 1) 공개 카드 anon SELECT ───────────────────────────────────────────────
-- RLS 정책은 GRANT 가 있어야 동작한다 — 최초 마이그레이션에서 revoke 했으므로 select 만 되돌린다.
grant select on public.workshop_artists to anon, authenticated;

drop policy if exists workshop_artists_public_select on public.workshop_artists;
create policy workshop_artists_public_select on public.workshop_artists
  for select to anon, authenticated
  using (status in ('published', 'recruiting', 'confirmed', 'completed'));

-- 관리자는 제안 접수(suggested)·보관(archived)까지 본다.
drop policy if exists workshop_artists_admin_select on public.workshop_artists;
create policy workshop_artists_admin_select on public.workshop_artists
  for select to authenticated
  using (public.is_admin());

-- 쓰기는 계속 service-role 전용(정책 없음 = deny).

-- ── 공개 집계 ─────────────────────────────────────────────────────────────
-- demands·reservations 는 계속 잠근 채, 카드에 필요한 "수"만 SECURITY DEFINER 로 내보낸다.
create or replace function public.workshop_public_counts()
returns table (artist_id uuid, demand_count integer, reserved_count integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    a.id,
    (select count(*)::int from public.workshop_demands d where d.artist_id = a.id),
    (select count(*)::int from public.workshop_reservations r
      where r.artist_id = a.id and r.status in ('paid', 'confirmed'))
  from public.workshop_artists a
  where a.status in ('published', 'recruiting', 'confirmed', 'completed');
$$;

grant execute on function public.workshop_public_counts() to anon, authenticated;

-- ── 2) 좌석 확보 (원자적) ──────────────────────────────────────────────────
create or replace function public.reserve_workshop_seat(
  p_artist_id uuid,
  p_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_new_order_no text,
  p_terms_version text,
  p_hold_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a public.workshop_artists%rowtype;
  taken integer;
  existing public.workshop_reservations%rowtype;
  new_id uuid;
  hold_until timestamptz;
begin
  -- 같은 워크샵의 좌석 계산을 직렬화한다(소규모라 성능 영향 없음).
  select * into a from public.workshop_artists where id = p_artist_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if a.status <> 'recruiting' then
    return jsonb_build_object('ok', false, 'error', 'NOT_RECRUITING');
  end if;
  if a.deposit_amount is null or a.deposit_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'NO_DEPOSIT');
  end if;
  if a.recruit_deadline is not null and a.recruit_deadline < now() then
    return jsonb_build_object('ok', false, 'error', 'DEADLINE');
  end if;

  hold_until := now() + make_interval(mins => greatest(p_hold_minutes, 5));

  -- 만료된 결제 대기는 좌석을 돌려준다.
  update public.workshop_reservations
     set status = 'cancelled',
         failure_reason = coalesce(failure_reason, 'hold_expired'),
         updated_at = now()
   where artist_id = p_artist_id
     and status = 'pending'
     and expires_at is not null
     and expires_at < now();

  -- 이미 결제를 마친 사람은 새 주문을 만들지 않는다.
  select * into existing from public.workshop_reservations
   where artist_id = p_artist_id
     and user_id = p_user_id
     and status in ('paid', 'confirmed', 'transferred')
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_PAID');
  end if;

  -- 정원: 결제완료 + 살아있는 홀드(본인 제외)
  if a.max_headcount is not null then
    select count(*) into taken from public.workshop_reservations
     where artist_id = p_artist_id
       and (
         status in ('paid', 'confirmed')
         or (status = 'pending' and user_id <> p_user_id
             and (expires_at is null or expires_at > now()))
       );
    if taken >= a.max_headcount then
      return jsonb_build_object('ok', false, 'error', 'FULL');
    end if;
  end if;

  select * into existing from public.workshop_reservations
   where artist_id = p_artist_id and user_id = p_user_id and status = 'pending'
   limit 1;

  if found then
    if existing.amount = a.deposit_amount then
      -- 같은 금액이면 주문번호를 유지한 채 홀드만 연장한다.
      update public.workshop_reservations
         set customer_name = p_name,
             customer_email = p_email,
             customer_phone = p_phone,
             terms_version = p_terms_version,
             terms_accepted_at = now(),
             expires_at = hold_until,
             updated_at = now()
       where id = existing.id;
      return jsonb_build_object('ok', true, 'reservation_id', existing.id,
                                'order_no', existing.order_no, 'pg_order_id', existing.pg_order_id,
                                'amount', existing.amount, 'reused', true);
    end if;
    -- 예약금이 바뀌었으면 옛 주문번호를 재사용하지 않는다(승인 금액 불일치 방지).
    update public.workshop_reservations
       set status = 'cancelled', failure_reason = 'amount_changed', updated_at = now()
     where id = existing.id;
  end if;

  insert into public.workshop_reservations
    (artist_id, user_id, customer_name, customer_email, customer_phone,
     amount, currency, status, order_no, pg_order_id, expires_at, terms_version, terms_accepted_at)
  values
    (p_artist_id, p_user_id, p_name, p_email, p_phone,
     a.deposit_amount, 'KRW', 'pending', p_new_order_no, p_new_order_no, hold_until, p_terms_version, now())
  returning id into new_id;

  return jsonb_build_object('ok', true, 'reservation_id', new_id,
                            'order_no', p_new_order_no, 'pg_order_id', p_new_order_no,
                            'amount', a.deposit_amount, 'reused', false);
end;
$$;

revoke all on function public.reserve_workshop_seat(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;

-- ── 3) 결제 승인 원자 전이 ─────────────────────────────────────────────────
-- 이 함수가 true 를 돌려준 요청만 영수증·운영 메일을 보낸다(중복 발송 차단).
-- 홀드 만료로 cancelled 가 된 뒤 승인이 들어와도 돈은 실제로 받았으므로 paid 로 기록한다.
create or replace function public.mark_workshop_reservation_paid(
  p_reservation_id uuid,
  p_provider text,
  p_payment_key text,
  p_receipt_url text,
  p_raw jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  changed integer;
begin
  update public.workshop_reservations
     set status = 'paid',
         pg_provider = p_provider,
         payment_key = p_payment_key,
         receipt_url = p_receipt_url,
         raw = p_raw,
         paid_at = now(),
         failure_reason = null,
         expires_at = null,
         updated_at = now()
   where id = p_reservation_id
     and status not in ('paid', 'confirmed', 'refunded', 'transferred');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.mark_workshop_reservation_paid(uuid, text, text, text, jsonb) from public, anon, authenticated;

create index if not exists workshop_reservations_user_idx
  on public.workshop_reservations (user_id, status);

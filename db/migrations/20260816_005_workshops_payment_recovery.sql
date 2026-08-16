-- deetz Workshops 결제 복구 상태 + 경합 보강 (Codex 라운드2 반영, 운영 적용 완료)
--
-- 문제 1: 승인된 결제를 cancelled 행에 그대로 paid 로 되살리면
--          (a) 관리자가 의도적으로 취소한 건이 부활하고
--          (b) 만료·금액변경으로 취소된 옛 주문이 늦게 승인돼 같은 사람의 예약이 2건 paid 가 된다.
--         → 'recovery_required' 상태로 분리해 돈은 기록하되 정상 예약으로 자동 복귀시키지 않는다.
-- 문제 2: pending 재사용 시 행 잠금이 없어 관리자 취소와 경합한다.

alter table public.workshop_reservations drop constraint if exists workshop_reservations_status_check;
alter table public.workshop_reservations add constraint workshop_reservations_status_check
  check (status in ('pending','paid','cancelled','refunded','transferred','confirmed','recovery_required'));

comment on column public.workshop_reservations.status is
  'pending=결제대기(홀드) / paid=예약금 결제완료 / confirmed=참가확정 / cancelled=취소·만료 / refunded=환불완료 / transferred=양도 / recovery_required=돈은 받았으나 정상 예약으로 자동복귀 불가(운영자 수동 처리 필요)';

-- 기존 pending 중 만료시각이 없는 행 백필(영구 좌석 점유 방지)
update public.workshop_reservations
   set expires_at = created_at + interval '15 minutes'
 where status = 'pending' and expires_at is null;

-- ── 좌석 확보: pending 재사용에 행 잠금 + 상태 조건 추가 ────────────────────
create or replace function public.reserve_workshop_seat(
  p_artist_id uuid,
  p_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_new_order_no text,
  p_terms_version text,
  p_hold_minutes integer default 15
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
  touched integer;
begin
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

  update public.workshop_reservations
     set status = 'cancelled',
         failure_reason = coalesce(failure_reason, 'hold_expired'),
         updated_at = now()
   where artist_id = p_artist_id
     and status = 'pending'
     and expires_at is not null
     and expires_at < now();

  select * into existing from public.workshop_reservations
   where artist_id = p_artist_id
     and user_id = p_user_id
     and status in ('paid', 'confirmed', 'transferred')
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_PAID');
  end if;

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

  -- 재사용 후보를 잠근 뒤 다룬다(관리자 취소와의 경합 차단).
  select * into existing from public.workshop_reservations
   where artist_id = p_artist_id and user_id = p_user_id and status = 'pending'
   limit 1
   for update;

  if found then
    if existing.amount = a.deposit_amount then
      update public.workshop_reservations
         set customer_name = p_name,
             customer_email = p_email,
             customer_phone = p_phone,
             terms_version = p_terms_version,
             terms_accepted_at = now(),
             expires_at = hold_until,
             updated_at = now()
       where id = existing.id
         and status = 'pending';
      get diagnostics touched = row_count;
      if touched = 1 then
        return jsonb_build_object('ok', true, 'reservation_id', existing.id,
                                  'order_no', existing.order_no, 'pg_order_id', existing.pg_order_id,
                                  'amount', existing.amount, 'reused', true);
      end if;
      -- 그 사이 상태가 바뀌었으면 새 주문으로 간다.
    else
      update public.workshop_reservations
         set status = 'cancelled', failure_reason = 'amount_changed', updated_at = now()
       where id = existing.id and status = 'pending';
    end if;
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

-- ── 승인 기록: 결과를 3가지로 구분해 돌려준다 ──────────────────────────────
--   recorded          = pending → paid (정상). 이 요청만 영수증 메일을 보낸다.
--   already_recorded  = 다른 요청이 먼저 확정함. 조용히 성공 화면.
--   recovery_required = 취소·만료된 주문에 뒤늦게 승인이 도착. 돈은 기록하되 예약으로 복귀시키지 않는다.
drop function if exists public.mark_workshop_reservation_paid(uuid, text, text, text, jsonb);

create or replace function public.mark_workshop_reservation_paid(
  p_reservation_id uuid,
  p_provider text,
  p_payment_key text,
  p_receipt_url text,
  p_raw jsonb
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cur public.workshop_reservations%rowtype;
begin
  select * into cur from public.workshop_reservations where id = p_reservation_id for update;
  if not found then
    return 'not_found';
  end if;

  if cur.status in ('paid', 'confirmed', 'refunded', 'transferred', 'recovery_required') then
    return 'already_recorded';
  end if;

  if cur.status = 'pending' then
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
     where id = p_reservation_id;
    return 'recorded';
  end if;

  -- cancelled 등: 돈은 실제로 받았으므로 기록은 하되 운영자 처리 대상으로 남긴다.
  update public.workshop_reservations
     set status = 'recovery_required',
         pg_provider = p_provider,
         payment_key = p_payment_key,
         receipt_url = p_receipt_url,
         raw = p_raw,
         paid_at = now(),
         memo = concat_ws(' | ', nullif(memo, ''),
                          'AUTO: 취소/만료된 주문에 결제 승인 도착 — 환불 또는 좌석 복구 필요'),
         updated_at = now()
   where id = p_reservation_id;
  return 'recovery_required';
end;
$$;

revoke all on function public.mark_workshop_reservation_paid(uuid, text, text, text, jsonb) from public, anon, authenticated;

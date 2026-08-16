-- deetz Workshops — 결제 복구 대기 중 재예약 차단 (Codex 라운드3 반영)
--
-- 배경: recovery_required(돈은 받았는데 자동 확정 실패)인 상태에서 같은 사용자가 새 예약을 만들면
--       중복 결제가 나고, 최신 행만 보는 화면에서 복구 건이 가려진다.
--       → 좌석 확보 단계에서 막고, 운영자가 paid/refunded 로 정리한 뒤에만 재예약을 허용한다.
--
-- ⚠️ unique index(workshop_reservations_active_uniq)에는 recovery_required 를 넣지 않는다.
--    "옛 주문 취소 → 새 주문 pending → 옛 주문 늦게 승인" 순서에서 상태 전이가 인덱스 충돌로 실패하면
--    받은 돈을 아예 기록하지 못한다. 기록은 항상 성공시키고, 재예약만 함수에서 막는 편이 안전하다.
--    (정원 계산에서는 계속 제외 — 복구 건이 남의 자리를 막지 않는다.)

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

  -- 결제 복구 대기 건이 있으면 새 결제를 만들지 않는다(중복 결제·복구건 가림 방지).
  select * into existing from public.workshop_reservations
   where artist_id = p_artist_id
     and user_id = p_user_id
     and status = 'recovery_required'
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'RECOVERY_PENDING');
  end if;

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

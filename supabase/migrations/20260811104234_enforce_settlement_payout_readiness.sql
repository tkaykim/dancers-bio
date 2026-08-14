-- A settlement may enter the withdrawal/payment pipeline only when the
-- dancer has a structurally valid payout account and resident/foreigner ID.
-- This trigger is the final guard even if an application code path is bypassed.

create or replace function public.enforce_settlement_payout_readiness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payout public.dancer_private_info%rowtype;
  account_number text;
  resident_number text;
  birth_year integer;
  checksum integer;
begin
  if new.status not in ('requested'::public.settlement_status, 'paid'::public.settlement_status) then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.dancer_id is not distinct from new.dancer_id then
    return new;
  end if;

  select *
  into payout
  from public.dancer_private_info
  where dancer_id = new.dancer_id;

  account_number := regexp_replace(
    coalesce(payout.bank_account_number, ''),
    '[[:space:]-]',
    '',
    'g'
  );
  resident_number := regexp_replace(
    coalesce(payout.resident_registration_number, ''),
    '[[:space:]-]',
    '',
    'g'
  );

  if nullif(btrim(payout.bank_name), '') is null
    or nullif(btrim(payout.bank_account_holder), '') is null
    or account_number !~ '^[0-9]{8,20}$' then
    raise exception using
      errcode = '23514',
      message = '출금신청에는 유효한 은행, 계좌번호, 예금주 정보가 필요합니다.';
  end if;

  if resident_number !~ '^[0-9]{13}$'
    or substring(resident_number, 7, 1) !~ '^[1-8]$' then
    raise exception using
      errcode = '23514',
      message = '출금신청에는 유효한 주민(외국인)등록번호가 필요합니다.';
  end if;

  birth_year := case substring(resident_number, 7, 1)
    when '1' then 1900 when '2' then 1900
    when '5' then 1900 when '6' then 1900
    else 2000
  end + substring(resident_number, 1, 2)::integer;

  begin
    perform make_date(
      birth_year,
      substring(resident_number, 3, 2)::integer,
      substring(resident_number, 5, 2)::integer
    );
  exception when others then
    raise exception using
      errcode = '23514',
      message = '출금신청에는 유효한 주민(외국인)등록번호가 필요합니다.';
  end;

  checksum := (
    11 - (
      substring(resident_number, 1, 1)::integer * 2 +
      substring(resident_number, 2, 1)::integer * 3 +
      substring(resident_number, 3, 1)::integer * 4 +
      substring(resident_number, 4, 1)::integer * 5 +
      substring(resident_number, 5, 1)::integer * 6 +
      substring(resident_number, 6, 1)::integer * 7 +
      substring(resident_number, 7, 1)::integer * 8 +
      substring(resident_number, 8, 1)::integer * 9 +
      substring(resident_number, 9, 1)::integer * 2 +
      substring(resident_number, 10, 1)::integer * 3 +
      substring(resident_number, 11, 1)::integer * 4 +
      substring(resident_number, 12, 1)::integer * 5
    ) % 11
  ) % 10;
  if substring(resident_number, 7, 1)::integer >= 5 then
    checksum := (checksum + 2) % 10;
  end if;
  if checksum <> substring(resident_number, 13, 1)::integer then
    raise exception using
      errcode = '23514',
      message = '출금신청에는 유효한 주민(외국인)등록번호가 필요합니다.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_settlement_payout_readiness() from public;
revoke execute on function public.enforce_settlement_payout_readiness() from anon;
revoke execute on function public.enforce_settlement_payout_readiness() from authenticated;

drop trigger if exists settlements_enforce_payout_readiness on public.settlements;

create trigger settlements_enforce_payout_readiness
before insert or update on public.settlements
for each row
execute function public.enforce_settlement_payout_readiness();

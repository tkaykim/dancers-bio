-- 복수 국적 데이터 정합성 + 지원서별 공개 동의 스냅샷을 DB에서도 강제한다.

create or replace function public.is_valid_nationality_list(
  value jsonb,
  allow_empty boolean default true
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) <= 10
    and (allow_empty or jsonb_array_length(value) > 0)
    and not exists (
      select 1
      from jsonb_array_elements(value) as item
      where jsonb_typeof(item) <> 'object'
        or coalesce(item->>'code', '') !~ '^([A-Z]{2}|OTHER)$'
        or length(trim(coalesce(item->>'label', ''))) not between 1 and 100
    )
    and (
      select count(*) = count(distinct upper(item->>'code'))
      from jsonb_array_elements(value) as item
    );
$$;

-- 최초 이관 때 legacy code가 비어 있던 대한민국 8건이 OTHER로 들어간 것을 복구한다.
update public.dancer_private_info
set nationalities = jsonb_set(nationalities, '{0,code}', to_jsonb('KR'::text), false),
    nationality_code = 'KR',
    nationality = trim(nationalities->0->>'label')
where is_korean_national is true
  and jsonb_typeof(nationalities) = 'array'
  and jsonb_array_length(nationalities) > 0
  and upper(coalesce(nationalities->0->>'code', '')) = 'OTHER';

-- 배열의 첫 국적과 기존 단일 필드는 항상 같은 값을 유지한다.
update public.dancer_private_info
set nationality_code = upper(trim(nationalities->0->>'code')),
    nationality = trim(nationalities->0->>'label'),
    is_korean_national = nationalities @> '[{"code":"KR"}]'::jsonb
where jsonb_typeof(nationalities) = 'array'
  and jsonb_array_length(nationalities) > 0
  and (
    upper(coalesce(nationality_code, '')) is distinct from upper(trim(nationalities->0->>'code'))
    or coalesce(nationality, '') is distinct from trim(nationalities->0->>'label')
    or is_korean_national is distinct from (nationalities @> '[{"code":"KR"}]'::jsonb)
  );

alter table public.dancer_private_info
  drop constraint if exists dancer_private_info_nationalities_valid_chk;
alter table public.dancer_private_info
  add constraint dancer_private_info_nationalities_valid_chk
  check (public.is_valid_nationality_list(nationalities));

alter table public.applications
  drop constraint if exists applications_nationality_consent_snapshot_chk;
alter table public.applications
  add constraint applications_nationality_consent_snapshot_chk
  check (
    (
      nationality_disclosure_consent is false
      and disclosed_nationalities is null
    )
    or (
      nationality_disclosure_consent is true
      and disclosed_nationalities is not null
      and public.is_valid_nationality_list(disclosed_nationalities, false)
    )
  );

create or replace function public.applications_nationality_snapshot_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  profile_nationalities jsonb;
begin
  if tg_op = 'UPDATE' then
    -- 지원 이후 프로필을 바꾸더라도 제출 당시 스냅샷은 바뀌지 않는다.
    new.nationality_disclosure_consent := old.nationality_disclosure_consent;
    new.disclosed_nationalities := old.disclosed_nationalities;
    return new;
  end if;

  if new.source <> 'apply'::public.application_source
     or coalesce(new.nationality_disclosure_consent, false) is false
     or new.dancer_id is null then
    new.nationality_disclosure_consent := false;
    new.disclosed_nationalities := null;
    return new;
  end if;

  select dpi.nationalities
  into profile_nationalities
  from public.dancer_private_info as dpi
  where dpi.dancer_id = new.dancer_id;

  if profile_nationalities is null
     or not public.is_valid_nationality_list(profile_nationalities, false) then
    new.nationality_disclosure_consent := false;
    new.disclosed_nationalities := null;
  else
    new.nationality_disclosure_consent := true;
    new.disclosed_nationalities := profile_nationalities;
  end if;

  return new;
end;
$$;

drop trigger if exists applications_nationality_snapshot_guard_trg
  on public.applications;
create trigger applications_nationality_snapshot_guard_trg
before insert or update on public.applications
for each row execute function public.applications_nationality_snapshot_guard();

comment on function public.applications_nationality_snapshot_guard() is
  '지원서 INSERT 시 본인 private 국적을 동의 여부에 따라 스냅샷하고 이후 변경을 막는다.';

-- 복수 국적 저장 + 지원서별 국적 공개 동의 스냅샷.
-- 공개 프로필에는 국적을 추가하지 않고, 지원자가 동의한 지원서에만 담당자가 볼 수 있게 한다.

alter table public.dancer_private_info
  add column if not exists nationalities jsonb not null default '[]'::jsonb;

update public.dancer_private_info
set nationalities = jsonb_build_array(
  jsonb_build_object(
    'code', case
      when is_korean_national is true then 'KR'
      else coalesce(nullif(upper(trim(nationality_code)), ''), 'OTHER')
    end,
    'label', trim(nationality)
  )
)
where jsonb_typeof(nationalities) = 'array'
  and jsonb_array_length(nationalities) = 0
  and nullif(trim(nationality), '') is not null;

alter table public.applications
  add column if not exists nationality_disclosure_consent boolean not null default false,
  add column if not exists disclosed_nationalities jsonb;

comment on column public.dancer_private_info.nationalities is
  '본인 프로필의 복수 국적 목록. 공개 프로필에는 노출하지 않는다.';
comment on column public.applications.nationality_disclosure_consent is
  '지원자가 이 지원서의 담당자에게 국적 공개를 동의했는지 여부.';
comment on column public.applications.disclosed_nationalities is
  '지원 시 동의한 경우 저장하는 국적 목록 스냅샷. 공개 프로필에는 사용하지 않는다.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dancer_private_info_nationalities_array_chk'
      and conrelid = 'public.dancer_private_info'::regclass
  ) then
    alter table public.dancer_private_info
      add constraint dancer_private_info_nationalities_array_chk
      check (jsonb_typeof(nationalities) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_disclosed_nationalities_array_chk'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_disclosed_nationalities_array_chk
      check (
        disclosed_nationalities is null
        or jsonb_typeof(disclosed_nationalities) = 'array'
      );
  end if;
end $$;

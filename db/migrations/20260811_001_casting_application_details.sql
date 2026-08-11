-- 공고별 상세 캐스팅 지원서 수집.
-- 기존 공고는 false라 지원 흐름이 바뀌지 않으며, 활성화한 공고만 아래 필드를 필수로 받는다.

alter table public.projects
  add column if not exists collect_casting_details boolean not null default false;

alter table public.applications
  add column if not exists applicant_name text,
  add column if not exists birth_year smallint,
  add column if not exists height_cm smallint,
  add column if not exists primary_genre text,
  add column if not exists dance_video_url text,
  add column if not exists backup_dancer_history text,
  add column if not exists personal_profile_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'applications_casting_details_values_chk'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_casting_details_values_chk
      check (
        (applicant_name is null or char_length(applicant_name) between 1 and 100)
        and (birth_year is null or birth_year between 1900 and 2100)
        and (height_cm is null or height_cm between 50 and 250)
        and (primary_genre is null or char_length(primary_genre) between 1 and 100)
        and (dance_video_url is null or char_length(dance_video_url) between 1 and 2000)
        and (backup_dancer_history is null or char_length(backup_dancer_history) between 1 and 2000)
        and (personal_profile_url is null or char_length(personal_profile_url) between 1 and 2000)
      );
  end if;
end $$;

comment on column public.projects.collect_casting_details is
  '지원 시 이름·출생연도·키·주 장르·춤 영상·백업댄서 이력과 선택 개인 프로필을 받는 공고 여부.';
comment on column public.applications.applicant_name is '지원 당시 제출한 이름 스냅샷.';
comment on column public.applications.birth_year is '지원 당시 제출한 출생연도.';
comment on column public.applications.height_cm is '지원 당시 제출한 키(cm).';
comment on column public.applications.primary_genre is '지원 당시 제출한 주 장르.';
comment on column public.applications.dance_video_url is '지원 당시 제출한 춤 영상 URL.';
comment on column public.applications.backup_dancer_history is '지원 당시 제출한 백업댄서 이력. 경력 없음은 없음으로 제출.';
comment on column public.applications.personal_profile_url is '지원 당시 제출한 개인 프로필 URL. 보유한 경우에만 제출.';

-- 운영 백필·복구를 수행하는 postgres 세션은 제출 스냅샷을 유지보수할 수 있어야 한다.
-- 일반 PostgREST 요청은 session_user=authenticator이므로 이 예외를 사용할 수 없다.

create or replace function public.applications_casting_details_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requires_casting_details boolean := false;
  snapshot_changed boolean := false;
begin
  select coalesce(p.collect_casting_details, false)
    into requires_casting_details
  from public.projects p
  where p.id = new.project_id;

  if new.source = 'apply'::public.application_source
     and requires_casting_details
     and (
       nullif(btrim(new.applicant_name), '') is null
       or new.birth_year is null
       or new.height_cm is null
       or nullif(btrim(new.primary_genre), '') is null
       or nullif(btrim(new.dance_video_url), '') is null
       or new.dance_video_url !~* '^https?://'
       or nullif(btrim(new.backup_dancer_history), '') is null
       or (
         new.personal_profile_url is not null
         and new.personal_profile_url !~* '^https?://'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = '상세 캐스팅 지원 정보를 모두 올바르게 입력해 주세요.';
  end if;

  if tg_op = 'UPDATE' then
    snapshot_changed :=
      old.applicant_name is distinct from new.applicant_name
      or old.birth_year is distinct from new.birth_year
      or old.height_cm is distinct from new.height_cm
      or old.primary_genre is distinct from new.primary_genre
      or old.dance_video_url is distinct from new.dance_video_url
      or old.backup_dancer_history is distinct from new.backup_dancer_history
      or old.personal_profile_url is distinct from new.personal_profile_url;

    if snapshot_changed
       and coalesce(auth.role(), '') <> 'service_role'
       and session_user <> 'postgres'
       and not public.is_admin()
       and not public.can_manage_project(old.project_id) then
      raise exception using
        errcode = '42501',
        message = '제출된 상세 지원 정보는 수정할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.applications_casting_details_guard() from public;
grant execute on function public.applications_casting_details_guard() to authenticated, service_role;

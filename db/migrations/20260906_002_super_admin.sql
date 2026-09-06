-- 슈퍼관리자: 전역 재무 접근 분리.
-- 운영 DB 적용은 별도 담당자가 수행한다.
begin;

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select is_super_admin and is_admin from public.profiles where id = auth.uid()), false);
$$;

-- profiles_update_self / profiles_admin_all은 행 단위 정책이라 컬럼을 제한하지 않는다.
-- 2026-09-06 점검: authenticated 역할이 profiles.is_admin UPDATE 권한을 갖고 있어
-- 로그인 사용자가 자기 행의 is_admin 을 직접 켤 수 있었다(REST 경로). 등급 플래그(is_admin, is_super_admin)는
-- anon/authenticated 역할의 INSERT/UPDATE 로는 바꿀 수 없게 막는다. service_role·SQL 운영자·SECURITY DEFINER
-- 함수(현재 사용자 = 소유자)는 영향 없다. 일반 프로필 수정은 그대로 허용한다.
create or replace function public.protect_super_admin_flag() returns trigger
language plpgsql security invoker set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.is_super_admin or new.is_admin then
        raise exception 'ROLE_FLAG_SQL_ONLY' using errcode = '42501';
      end if;
    elsif new.is_super_admin is distinct from old.is_super_admin
       or new.is_admin is distinct from old.is_admin then
      raise exception 'ROLE_FLAG_SQL_ONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_super_admin_flag on public.profiles;
create trigger profiles_protect_super_admin_flag
before insert or update on public.profiles
for each row execute function public.protect_super_admin_flag();

-- 초기 부여는 대표 계정 한 명만 대상으로 한다.
update public.profiles set is_super_admin = true
where id = 'a182002f-5646-4757-8270-8f6e1b2b4d3d';

-- 변경 전 정의: 2026-09-06 pg_policies 조회로 확인.
-- create policy settlements_select on public.settlements for select using (
--   can_act_as_dancer(dancer_id)
--   or (can_manage_project(project_id) and role in ('dancer','travel'))
--   or is_admin()
-- );
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select using (
    can_act_as_dancer(dancer_id)
    or (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_super_admin()
  );

-- create policy settlements_manage on public.settlements for all
-- using (
--   (can_manage_project(project_id) and role in ('dancer','travel')) or is_admin()
-- ) with check (
--   (can_manage_project(project_id) and role in ('dancer','travel')) or is_admin()
-- );
drop policy if exists settlements_manage on public.settlements;
create policy settlements_manage on public.settlements
  for all using (
    (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_super_admin()
  ) with check (
    (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_super_admin()
  );

-- create policy dancer_ledger_select_own on public.dancer_ledger_entries
-- for select using (
--   public.is_admin() or exists (
--     select 1 from public.dancers d
--     where d.id = dancer_ledger_entries.dancer_id
--       and d.profile_id = (select auth.uid())
--   )
-- );
drop policy if exists dancer_ledger_select_own on public.dancer_ledger_entries;
create policy dancer_ledger_select_own on public.dancer_ledger_entries
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.dancers d
      where d.id = dancer_ledger_entries.dancer_id
        and d.profile_id = (select auth.uid())
    )
  );

-- create policy withdrawal_requests_select_own on public.withdrawal_requests
-- for select using (
--   public.is_admin() or exists (
--     select 1 from public.dancers d
--     where d.id = withdrawal_requests.dancer_id
--       and d.profile_id = (select auth.uid())
--   )
-- );
drop policy if exists withdrawal_requests_select_own on public.withdrawal_requests;
create policy withdrawal_requests_select_own on public.withdrawal_requests
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.dancers d
      where d.id = withdrawal_requests.dancer_id
        and d.profile_id = (select auth.uid())
    )
  );

-- create policy rate_cards_select on public.dancer_rate_cards for select using (
--   is_admin()
--   or exists (
--     select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
--       and (d.profile_id = auth.uid() or manages_dancer(d.id))
--   )
--   or (is_public and exists (
--     select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
--       and d.approval_status = 'approved'::dancer_approval_status
--   ))
-- );
drop policy if exists rate_cards_select on public.dancer_rate_cards;
create policy rate_cards_select on public.dancer_rate_cards
  for select using (
    is_super_admin()
    or exists (
      select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
        and (d.profile_id = auth.uid() or manages_dancer(d.id))
    )
    or (is_public and exists (
      select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
        and d.approval_status = 'approved'::dancer_approval_status
    ))
  );

-- create policy rate_cards_write on public.dancer_rate_cards for all
-- using (
--   is_admin() or exists (
--     select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
--       and (d.profile_id = auth.uid() or manages_dancer(d.id))
--   )
-- ) with check (
--   is_admin() or exists (
--     select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
--       and (d.profile_id = auth.uid() or manages_dancer(d.id))
--   )
-- );
drop policy if exists rate_cards_write on public.dancer_rate_cards;
create policy rate_cards_write on public.dancer_rate_cards
  for all using (
    is_super_admin()
    or exists (
      select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
        and (d.profile_id = auth.uid() or manages_dancer(d.id))
    )
  ) with check (
    is_super_admin()
    or exists (
      select 1 from dancers d where d.id = dancer_rate_cards.dancer_id
        and (d.profile_id = auth.uid() or manages_dancer(d.id))
    )
  );

-- can_manage_project(), 프로젝트 풀과 수집 링크 정책은 변경하지 않는다.
commit;

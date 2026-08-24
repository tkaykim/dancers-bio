-- 스태프 정산 풀 Phase 1c — settlements RLS role 분리 (설계 §4.1)
-- 매니저(공동관리자)는 직접비 role(dancer·travel) 행만, staff·referral·other는 admin 전용.
-- ⚠ 대표 지시(2026-08-25): RLS 변경으로 되던 것이 안 되는 회귀 금지 —
--   코드 배포와 분리해 단독 적용하고, 적용 직후 여정별 회귀 체크(§4.4)를 전수 실행한다.
--
-- ── 롤백 SQL (변경 전 운영 정책 원문 스냅샷 2026-08-25) ──────────────────────
-- drop policy if exists settlements_select on public.settlements;
-- create policy settlements_select on public.settlements for select
--   using (can_manage_project(project_id) OR can_act_as_dancer(dancer_id));
-- drop policy if exists settlements_manage on public.settlements;
-- create policy settlements_manage on public.settlements for all
--   using (can_manage_project(project_id));
-- drop policy if exists settlements_event_participant_select on public.settlements;
-- create policy settlements_event_participant_select on public.settlements for select to authenticated
--   using ((event_participant_id IS NOT NULL) AND can_view_event_participant(event_participant_id));

drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select
  using (
    can_act_as_dancer(dancer_id)                                   -- 본인 행: role 무관
    or (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_admin()
  );

drop policy if exists settlements_manage on public.settlements;
create policy settlements_manage on public.settlements
  for all
  using (
    (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_admin()
  )
  with check (
    (can_manage_project(project_id) and role in ('dancer','travel'))
    or is_admin()
  );

-- 이벤트 viewer 경유 우회로 차단 — staff·referral 금액이 viewer/채널멤버에게 새지 않게.
drop policy if exists settlements_event_participant_select on public.settlements;
create policy settlements_event_participant_select on public.settlements
  for select to authenticated
  using (
    (event_participant_id is not null)
    and can_view_event_participant(event_participant_id)
    and role in ('dancer','travel')
  );
-- 서버(service_role) 전용 승인 RPC 2종.
--
-- 왜 필요한가:
--   기존 승인 함수들은 `is_admin()` 을 요구한다. is_admin() 은
--   `select is_admin from profiles where id = auth.uid()` 라서, service_role 로 호출하면
--   auth.uid() 가 null → false → `admin only` 예외가 난다.
--   그래서 다음 두 자동화가 "설계상 존재하지만 절대 성공하지 못하는" 상태였다:
--     ① deetz 앱 /api/verify/instagram-dm  → approve_instagram_verification 호출 시 항상 예외
--     ② 워커 deetz:dancer-intake          → system_approve_dancers 를 부르게 돼 있는데 함수 자체가 없음
--
-- 설계 원칙:
--   - 기존 admin 전용 함수(approve_instagram_verification / admin_bulk_approve_dancers)는 건드리지 않는다.
--     관리자 UI 의 가드를 약화시키지 않기 위해서다.
--   - 대신 system 변형을 새로 만들고 **service_role 에만 EXECUTE** 를 준다.
--     anon/authenticated 는 호출할 수 없으므로 권한 표면이 넓어지지 않는다.
--   - 부수효과(권한 발급·감사로그)는 기존 함수와 동일하게 유지한다 — 경로에 따라 결과가 달라지면 안 된다.

-- ── ① 인스타 본인인증 자동 승인 (DM 코드 대조 성공 시) ──────────────
create or replace function public.system_approve_instagram_verification(
  p_verification_id uuid,
  p_reason text default 'instagram_dm_auto'
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile_id uuid;
  v_handle text;
begin
  select profile_id, instagram_handle
  into v_profile_id, v_handle
  from public.instagram_verifications
  where id = p_verification_id and status = 'pending';

  if v_profile_id is null then
    raise exception 'verification not found or already processed';
  end if;

  update public.instagram_verifications
  set status = 'approved',
      reviewed_at = now()
  where id = p_verification_id;

  -- 관리자 승인 경로(approve_instagram_verification)와 동일한 부수효과.
  update public.profiles
  set can_create_project = true,
      instagram_handle = v_handle,
      instagram_verified_at = now()
  where id = v_profile_id;

  -- 누가 승인했는지 추적 가능해야 한다. 사람이 아니라 시스템임을 사유에 남긴다.
  insert into public.creator_permission_audit (profile_id, granted, reason, actor_id)
  values (
    v_profile_id,
    true,
    'Instagram DM verified (system): @' || v_handle || ' / ' || coalesce(p_reason, 'auto'),
    null
  );
end;
$$;

revoke all on function public.system_approve_instagram_verification(uuid, text) from public, anon, authenticated;
grant execute on function public.system_approve_instagram_verification(uuid, text) to service_role;

comment on function public.system_approve_instagram_verification(uuid, text) is
  'DM 코드 대조 성공 시 서버가 호출하는 인증 승인. service_role 전용. 핸들 일치·만료·중복 검사는 호출부(/api/verify/instagram-dm)가 이미 수행한다.';

-- ── ② 댄서 일괄 승인 (인테이크 워커용) ────────────────────────────
create or replace function public.system_approve_dancers(
  p_ids uuid[],
  p_reason text default 'system:intake'
)
returns table (updated_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- dancers_guard_admin_fields 트리거 우회 (트랜잭션 로컬).
  perform set_config('app.bypass_dancers_guard', 'on', true);
  return query
    update public.dancers d
    set approval_status = 'approved',
        approved_at = coalesce(d.approved_at, now()),
        approval_reject_reason = null
    where d.id = any(p_ids)
      and d.approval_status = 'pending'
    returning d.id;
end;
$$;

revoke all on function public.system_approve_dancers(uuid[], text) from public, anon, authenticated;
grant execute on function public.system_approve_dancers(uuid[], text) to service_role;

comment on function public.system_approve_dancers(uuid[], text) is
  '워커(deetz:dancer-intake)용 일괄 승인. service_role 전용. 승인 자격 판정은 호출부가 src/lib/scoring/triage.ts 규칙으로 수행한다 — 기준을 두 곳에 두지 않는다.';

-- deetz Workshops — 제출자 거주지 + 중복 의심·병합 (대표 지시 2026-08-16)
--
-- 1) 수요 제출자의 거주 국가/도시를 받는다(기본 KR/서울은 앱에서 채움).
--    해외 수요가 쌓이면 "한국 댄서를 해외로 보내는 창구"의 근거 데이터가 된다.
-- 2) 같은 안무가가 이름 변형(성만·이름만·표기차)으로 중복 카드가 되는 문제:
--    핸들 compact 일치(점·언더스코어 무시)는 앱에서 자동 합산하고,
--    이름만 비슷한 경우는 possible_duplicate_of 로 표시해 운영자가 병합한다.

alter table public.workshop_demands
  add column if not exists country_code text,
  add column if not exists city text;

comment on column public.workshop_demands.country_code is '제출자 거주 국가(ISO 3166-1 alpha-2). 앱 기본값 KR.';
comment on column public.workshop_demands.city is '제출자 거주 도시(자유 입력). 앱 기본값 서울.';

alter table public.workshop_artists
  add column if not exists possible_duplicate_of uuid references public.workshop_artists(id) on delete set null;

comment on column public.workshop_artists.possible_duplicate_of is
  '이름 유사로 중복이 의심되는 기존 카드. 운영자가 어드민에서 병합(merge_workshop_artist)으로 정리한다.';

-- ── 병합: source 의 수요를 target 으로 이관하고 source 는 보관 처리 ─────────
-- 같은 제출자(이메일/인스타/계정)가 양쪽에 수요를 남긴 경우 unique 충돌이 나므로
-- 충돌분은 삭제(이미 target 에 있음)하고 나머지만 이관한다.
create or replace function public.merge_workshop_artist(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  moved integer := 0;
  dropped integer := 0;
  has_reservations integer;
begin
  if p_source = p_target then
    return jsonb_build_object('ok', false, 'error', 'SAME_ARTIST');
  end if;
  perform 1 from public.workshop_artists where id = p_source;
  if not found then return jsonb_build_object('ok', false, 'error', 'SOURCE_NOT_FOUND'); end if;
  perform 1 from public.workshop_artists where id = p_target;
  if not found then return jsonb_build_object('ok', false, 'error', 'TARGET_NOT_FOUND'); end if;

  -- 결제가 붙은 카드는 병합하지 않는다(정산·환불 추적이 꼬인다). 운영자가 수동 정리.
  select count(*) into has_reservations from public.workshop_reservations where artist_id = p_source;
  if has_reservations > 0 then
    return jsonb_build_object('ok', false, 'error', 'HAS_RESERVATIONS');
  end if;

  -- target 에 같은 제출자가 이미 있으면 source 쪽을 버린다.
  delete from public.workshop_demands d
   where d.artist_id = p_source
     and exists (
       select 1 from public.workshop_demands t
        where t.artist_id = p_target
          and (
            (d.user_id is not null and t.user_id = d.user_id)
            or (d.contact_email is not null and lower(t.contact_email) = lower(d.contact_email))
            or (d.contact_instagram is not null and lower(t.contact_instagram) = lower(d.contact_instagram))
          )
     );
  get diagnostics dropped = row_count;

  update public.workshop_demands set artist_id = p_target where artist_id = p_source;
  get diagnostics moved = row_count;

  update public.workshop_artists
     set status = 'archived',
         possible_duplicate_of = p_target,
         updated_at = now()
   where id = p_source;

  update public.workshop_artists
     set possible_duplicate_of = null, updated_at = now()
   where id = p_target and possible_duplicate_of = p_source;

  return jsonb_build_object('ok', true, 'moved', moved, 'dropped_duplicates', dropped);
end;
$$;

revoke all on function public.merge_workshop_artist(uuid, uuid) from public, anon, authenticated;

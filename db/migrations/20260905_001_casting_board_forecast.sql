-- 캐스팅 보드 라인업 예측 확장.
-- 클라이언트 보드에 팔로워·최근 릴스 기대조회·티어·진행 상태를 싣고, 화면이 예상 조회 구간을 계산한다.
-- 금액(신청액·제안액·확정액)은 이 테이블과 casting_boards.settings 어디에도 저장하지 않는다.
-- settings는 공개 보드 화면으로 통째로 직렬화되므로 금액이 들어가면 그대로 노출된다.

alter table public.casting_board_members
  add column if not exists lineup_status text,
  add column if not exists account_type text,
  add column if not exists ig_handle text,
  add column if not exists photo_url text,
  add column if not exists followers integer,
  add column if not exists expected_views integer,
  add column if not exists median_views integer,
  add column if not exists views_low integer,
  add column if not exists views_high integer,
  add column if not exists tier text,
  add column if not exists content_direction text,
  add column if not exists metrics_collected_on date,
  add column if not exists metrics_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'casting_board_members_lineup_status_check'
      and conrelid = 'public.casting_board_members'::regclass
  ) then
    alter table public.casting_board_members
      add constraint casting_board_members_lineup_status_check
      check (lineup_status is null or lineup_status = any (array['confirmed', 'negotiating', 'proposed']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'casting_board_members_account_type_check'
      and conrelid = 'public.casting_board_members'::regclass
  ) then
    alter table public.casting_board_members
      add constraint casting_board_members_account_type_check
      check (account_type is null or account_type = any (array['individual', 'team', 'format']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'casting_board_members_tier_check'
      and conrelid = 'public.casting_board_members'::regclass
  ) then
    alter table public.casting_board_members
      add constraint casting_board_members_tier_check
      check (tier is null or tier = any (array['anchor', 'mid', 'longtail']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'casting_board_members_metrics_nonnegative_check'
      and conrelid = 'public.casting_board_members'::regclass
  ) then
    alter table public.casting_board_members
      add constraint casting_board_members_metrics_nonnegative_check
      check (
        (followers is null or followers >= 0)
        and (expected_views is null or expected_views >= 0)
        and (median_views is null or median_views >= 0)
        and (views_low is null or views_low >= 0)
        and (views_high is null or views_high >= 0)
      );
  end if;
end $$;

comment on column public.casting_board_members.lineup_status is
  '라인업 진행 상태. confirmed=확정, negotiating=협의 중(지원 완료·조건 조율), proposed=제안 예정(직접 발굴, 미접촉). 값이 있으면 공개 보드에 지원 상태와 무관하게 노출한다.';
comment on column public.casting_board_members.account_type is 'individual=개인, team=팀·크루, format=기획형 계정.';
comment on column public.casting_board_members.ig_handle is '지표를 측정한 Instagram 계정. 업로드 계정 기준.';
comment on column public.casting_board_members.photo_url is 'deetz 프로필 사진이 없는 외부 후보의 대체 사진 URL.';
comment on column public.casting_board_members.followers is '측정 시점 Instagram 팔로워 수.';
comment on column public.casting_board_members.expected_views is '보정 기대조회. 최근 일반 릴스 10개 중 상·하위 2개 제외 6개 평균과 중앙값×1.5 중 작은 값.';
comment on column public.casting_board_members.median_views is '최근 일반 릴스 10개 조회수 중앙값.';
comment on column public.casting_board_members.views_low is '중간 6개 중 최저 조회수.';
comment on column public.casting_board_members.views_high is '중간 6개 중 최고 조회수.';
comment on column public.casting_board_members.tier is 'anchor=기대조회 5만 이상, mid=1만 이상, longtail=1만 미만. 비우면 화면이 expected_views로 계산한다.';
comment on column public.casting_board_members.content_direction is '클라이언트에게 보여주는 콘텐츠 방향 메모(예: 윤수 콜라보 제안).';
comment on column public.casting_board_members.metrics_collected_on is '팔로워·조회수 수집일.';
comment on column public.casting_board_members.metrics_source is '수집 방법 메모(예: Instagram 공개 화면 수동 확인).';

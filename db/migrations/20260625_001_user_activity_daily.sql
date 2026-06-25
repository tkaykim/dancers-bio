-- 방문 기반 DAU/MAU 책정용 일자별 활동 원장.
-- (user_id, day) 유니크 — 하루 1행. 미들웨어가 touch_activity()로 멱등 기록.
-- DAU = 그날 행 수, MAU = 최근 30일 distinct user. 과거 소급 불가(수집 시작일부터).

create table if not exists public.user_activity_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  source text,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists user_activity_daily_day_idx
  on public.user_activity_daily (day);

alter table public.user_activity_daily enable row level security;

-- 직접 쓰기는 전부 definer RPC 경유. 조회는 본인 또는 관리자만.
drop policy if exists uad_select on public.user_activity_daily;
create policy uad_select on public.user_activity_daily
  for select
  using (public.is_admin() or user_id = auth.uid());

-- 활동 기록(멱등). 로그인 세션의 anon-key 클라이언트(미들웨어)에서 호출.
create or replace function public.touch_activity(_source text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.user_activity_daily (user_id, day, source)
  values (auth.uid(), current_date, _source)
  on conflict (user_id, day) do nothing;
end;
$$;
grant execute on function public.touch_activity(text) to authenticated, anon;

-- 관리자 요약: DAU(오늘)·WAU(7일)·MAU(30일)·수집 시작일·총 이벤트.
create or replace function public.admin_activity_summary()
returns table (
  dau int,
  wau int,
  mau int,
  tracked_since date,
  total_events bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select
    (select count(*)::int from public.user_activity_daily where day = current_date),
    (select count(distinct user_id)::int from public.user_activity_daily where day >= current_date - 6),
    (select count(distinct user_id)::int from public.user_activity_daily where day >= current_date - 29),
    (select min(day) from public.user_activity_daily),
    (select count(*) from public.user_activity_daily);
end;
$$;
grant execute on function public.admin_activity_summary() to authenticated;

-- 일별 DAU 시계열(빈 날 0 채움).
create or replace function public.admin_dau_series(_days int default 90)
returns table (day date, dau int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select gs::date as day, count(ua.user_id)::int as dau
  from generate_series(current_date - (_days - 1), current_date, interval '1 day') gs
  left join public.user_activity_daily ua on ua.day = gs::date
  group by gs
  order by gs;
end;
$$;
grant execute on function public.admin_dau_series(int) to authenticated;

-- 월별 MAU(달력월 distinct) 시계열.
create or replace function public.admin_mau_monthly(_months int default 12)
returns table (month date, mau int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select date_trunc('month', day)::date as month, count(distinct user_id)::int as mau
  from public.user_activity_daily
  where day >= (date_trunc('month', current_date) - make_interval(months => _months - 1))::date
  group by 1
  order by 1;
end;
$$;
grant execute on function public.admin_mau_monthly(int) to authenticated;

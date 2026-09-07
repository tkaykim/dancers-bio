-- File only: apply separately before deploying the campaign tools.
begin;

create table public.campaign_posts (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  short_code text not null, post_url text not null, owner_handle text, owner_confirmed_at timestamptz,
  collab_handles text[] not null default '{}', dancer_id uuid references public.dancers(id),
  application_id uuid references public.applications(id), display_name text,
  forecast_member_id uuid references public.casting_board_members(id), forecast_expected_views integer check (forecast_expected_views >= 0),
  posted_at timestamptz, source text not null check (source in ('admin_paste','csv_import','participant','backfill')),
  status text not null default 'active' check (status in ('active','unverified','removed','excluded')), note text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, short_code), unique(id, project_id)
);
create table public.campaign_snapshots (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  label text not null, taken_at timestamptz not null default now(), source text not null check(source in ('apify','backfill')),
  status text not null default 'reserved' check(status in ('reserved','running','succeeded','partial','failed')), error text,
  reels_run_id text, profiles_run_id text, reels_dataset_id text, profiles_dataset_id text, apify_run_id text,
  estimated_cost_usd numeric not null default 0 check(estimated_cost_usd between 0 and 3),
  reels_estimated_cost_usd numeric not null default 0 check(reels_estimated_cost_usd >= 0),
  profiles_estimated_cost_usd numeric not null default 0 check(profiles_estimated_cost_usd >= 0), apify_cost_usd numeric check(apify_cost_usd >= 0),
  include_shares boolean not null default false, posts_total integer not null check(posts_total between 1 and 300), posts_found integer not null default 0,
  target_post_ids uuid[] not null, followers_collected boolean not null default false, followers_snapshot_id uuid,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique(id,project_id), unique(project_id,apify_run_id),
  check(reels_estimated_cost_usd + profiles_estimated_cost_usd <= 3),
  foreign key(followers_snapshot_id,project_id) references public.campaign_snapshots(id,project_id)
);
create index campaign_snapshots_project_time on public.campaign_snapshots(project_id,taken_at desc);
create index campaign_snapshots_daily on public.campaign_snapshots(created_at) where source = 'apify';
create table public.campaign_post_metrics (
  project_id uuid not null, snapshot_id uuid not null, post_id uuid not null,
  fetch_status text not null check(fetch_status in ('found','not_found','error')),
  plays integer check(plays >= 0), views_legacy integer check(views_legacy >= 0), likes integer check(likes >= 0),
  likes_source text check(likes_source in ('reel','profile')), comments integer check(comments >= 0), comments_disabled boolean not null default false,
  shares integer check(shares >= 0), audio_id text, hashtags text[] default '{}', mentions text[] default '{}',
  paid_partnership boolean, caption_excerpt text check(length(caption_excerpt) <= 200), raw jsonb,
  primary key(snapshot_id,post_id), foreign key(snapshot_id,project_id) references public.campaign_snapshots(id,project_id),
  foreign key(post_id,project_id) references public.campaign_posts(id,project_id)
);
create table public.campaign_account_metrics (
  project_id uuid not null, snapshot_id uuid not null, handle text not null, followers integer check(followers >= 0),
  is_private boolean not null default false, full_name text, profile_pic_url text, apify_run_id text, raw jsonb,
  primary key(snapshot_id,handle), foreign key(snapshot_id,project_id) references public.campaign_snapshots(id,project_id)
);
create table public.campaign_reports (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  share_code text not null unique default public.gen_project_survey_code(), title text not null, client_label text,
  published_snapshot_id uuid, published_payload jsonb, published_at timestamptz, published_by uuid references public.profiles(id),
  settings jsonb not null default '{}', is_active boolean not null default true, expires_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(published_snapshot_id,project_id) references public.campaign_snapshots(id,project_id)
);
create table public.campaign_rules (
  project_id uuid primary key references public.projects(id), audio_id text, required_tags text[] not null default '{}',
  required_mentions text[] not null default '{}', forecast_board_id uuid references public.casting_boards(id), first_posted_at timestamptz,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);

alter table public.campaign_posts enable row level security;
alter table public.campaign_snapshots enable row level security;
alter table public.campaign_post_metrics enable row level security;
alter table public.campaign_account_metrics enable row level security;
alter table public.campaign_reports enable row level security;
alter table public.campaign_rules enable row level security;
revoke all on public.campaign_posts, public.campaign_snapshots, public.campaign_post_metrics, public.campaign_account_metrics, public.campaign_reports, public.campaign_rules from public, anon, authenticated;
grant all on public.campaign_posts, public.campaign_snapshots, public.campaign_post_metrics, public.campaign_account_metrics, public.campaign_reports, public.campaign_rules to service_role;

create function public.campaign_reserve_snapshot(
  p_project uuid, p_est_usd numeric, p_by uuid, p_targets uuid[], p_label text,
  p_include_shares boolean, p_collect_followers boolean, p_reels_usd numeric, p_profiles_usd numeric
) returns public.campaign_snapshots language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.campaign_snapshots; day_start timestamptz;
begin
  -- Serialize the global daily budget, including concurrent projects.
  perform pg_advisory_xact_lock(71920260907);
  day_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if p_est_usd is null or p_est_usd < 0 or p_est_usd > 3 or p_reels_usd is null or p_profiles_usd is null
    or p_reels_usd < 0.2 or p_profiles_usd < 0 or p_reels_usd + p_profiles_usd > 3
    or abs(p_est_usd - p_reels_usd - p_profiles_usd) > 0.000001
    or (not p_collect_followers and p_profiles_usd <> 0) then raise exception 'CAMPAIGN_COST_LIMIT'; end if;
  if coalesce(cardinality(p_targets),0) not between 1 and 300
    or (select count(*) from public.campaign_posts where project_id=p_project and id=any(p_targets) and status <> 'excluded') <> cardinality(p_targets)
    then raise exception 'CAMPAIGN_TARGET_LIMIT'; end if;
  if (select count(*) from public.campaign_snapshots where source='apify' and created_at >= day_start and project_id=p_project) >= 3
    then raise exception 'CAMPAIGN_PROJECT_DAILY_LIMIT'; end if;
  if (select count(*) from public.campaign_snapshots where source='apify' and created_at >= day_start) >= 10
    then raise exception 'CAMPAIGN_GLOBAL_DAILY_LIMIT'; end if;
  insert into public.campaign_snapshots(project_id,label,source,estimated_cost_usd,created_by,target_post_ids,posts_total,include_shares,followers_collected,reels_estimated_cost_usd,profiles_estimated_cost_usd)
    values(p_project,p_label,'apify',p_est_usd,p_by,p_targets,cardinality(p_targets),p_include_shares,p_collect_followers,p_reels_usd,p_profiles_usd) returning * into s;
  return s;
end $$;

-- p_items = {items: [...], meta: {cost, followers_collected, partial, error}}.
create function public.campaign_finalize_snapshot(p_snapshot uuid, p_items jsonb, p_accounts jsonb)
returns public.campaign_snapshots language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.campaign_snapshots; item jsonb; account jsonb; pid uuid; previous_status text; new_owner text; collected boolean; follower_id uuid;
begin
  select * into s from public.campaign_snapshots where id=p_snapshot for update;
  if not found then raise exception 'CAMPAIGN_SNAPSHOT_MISSING'; end if;
  if s.status in ('succeeded','partial','failed') then return s; end if;
  -- Serialize post transitions across different snapshots of the same project.
  perform 1 from public.projects where id=s.project_id for update;
  if jsonb_typeof(p_items->'items') is distinct from 'array' or jsonb_typeof(p_accounts) is distinct from 'array'
    then raise exception 'CAMPAIGN_INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items->'items') <> s.posts_total
    or (select count(distinct (x->>'post_id')::uuid) from jsonb_array_elements(p_items->'items') x) <> s.posts_total
    then raise exception 'CAMPAIGN_TARGET_MISMATCH'; end if;
  for item in select value from jsonb_array_elements(p_items->'items') loop
    pid := (item->>'post_id')::uuid;
    if not (pid=any(s.target_post_ids)) or item->>'project_id' is distinct from s.project_id::text
      or item->>'snapshot_id' is distinct from s.id::text then raise exception 'CAMPAIGN_PROJECT_MISMATCH'; end if;
    insert into public.campaign_post_metrics(project_id,snapshot_id,post_id,fetch_status,plays,views_legacy,likes,likes_source,comments,comments_disabled,shares,audio_id,hashtags,mentions,paid_partnership,caption_excerpt,raw)
    values(s.project_id,s.id,pid,item->>'fetch_status',(item->>'plays')::integer,(item->>'views_legacy')::integer,(item->>'likes')::integer,item->>'likes_source',
      (item->>'comments')::integer,coalesce((item->>'comments_disabled')::boolean,false),(item->>'shares')::integer,item->>'audio_id',
      case when jsonb_typeof(item->'hashtags')='array' then array(select jsonb_array_elements_text(item->'hashtags')) else null end,
      case when jsonb_typeof(item->'mentions')='array' then array(select jsonb_array_elements_text(item->'mentions')) else null end,
      (item->>'paid_partnership')::boolean,left(item->>'caption_excerpt',200),item->'raw')
    on conflict(snapshot_id,post_id) do nothing;
    if item->>'fetch_status' = 'found' then
      new_owner := nullif(item->>'owner_handle','');
      if item->'links'->>'application_id' is not null and not exists (
        select 1 from public.applications a where a.id=(item->'links'->>'application_id')::uuid
        and a.project_id=s.project_id and a.dancer_id=(item->'links'->>'dancer_id')::uuid
      ) then raise exception 'CAMPAIGN_APPLICATION_MISMATCH'; end if;
      if item->'links'->>'forecast_member_id' is not null and not exists (
        select 1 from public.casting_board_members m join public.casting_boards b on b.id=m.board_id
        join public.campaign_rules r on r.project_id=b.project_id and r.forecast_board_id=b.id
        where m.id=(item->'links'->>'forecast_member_id')::uuid and b.project_id=s.project_id
      ) then raise exception 'CAMPAIGN_FORECAST_MISMATCH'; end if;
      update public.campaign_posts set
        note = case when owner_confirmed_at is null and owner_handle is not null and new_owner is not null and owner_handle <> new_owner
          then concat_ws(E'\n',note,'소유 계정 불일치: 입력 @' || owner_handle || ' / 관측 @' || new_owner) else note end,
        owner_handle=case when owner_confirmed_at is null then coalesce(new_owner,owner_handle) else owner_handle end,
        owner_confirmed_at=case when new_owner is not null then coalesce(owner_confirmed_at,s.taken_at) else owner_confirmed_at end,
        posted_at=coalesce(posted_at,(item->>'posted_at')::timestamptz),
        collab_handles=array(select distinct h from unnest(collab_handles || array(select jsonb_array_elements_text(coalesce(item->'collab_handles','[]')))) h where h <> coalesce(new_owner,owner_handle,'')),
        dancer_id=coalesce(dancer_id,(item->'links'->>'dancer_id')::uuid),
        application_id=coalesce(application_id,(item->'links'->>'application_id')::uuid),
        forecast_member_id=coalesce(forecast_member_id,(item->'links'->>'forecast_member_id')::uuid),
        forecast_expected_views=coalesce(forecast_expected_views,(item->'links'->>'forecast_expected_views')::integer),
        updated_at=now()
        where id=pid and project_id=s.project_id;
    end if;
  end loop;
  for account in select value from jsonb_array_elements(p_accounts) loop
    if account->>'project_id' is distinct from s.project_id::text or account->>'snapshot_id' is distinct from s.id::text
      then raise exception 'CAMPAIGN_ACCOUNT_PROJECT_MISMATCH'; end if;
    insert into public.campaign_account_metrics(project_id,snapshot_id,handle,followers,is_private,full_name,profile_pic_url,apify_run_id,raw)
    values(s.project_id,s.id,account->>'handle',(account->>'followers')::integer,coalesce((account->>'is_private')::boolean,false),account->>'full_name',account->>'profile_pic_url',account->>'apify_run_id',account->'raw')
    on conflict(snapshot_id,handle) do nothing;
  end loop;
  collected := s.followers_collected and coalesce((p_items->'meta'->>'followers_collected')::boolean,false);
  if collected then follower_id := s.id;
  else select id into follower_id from public.campaign_snapshots where project_id=s.project_id and status in ('succeeded','partial') and followers_collected and taken_at <= s.taken_at order by taken_at desc limit 1; end if;
  update public.campaign_snapshots set status=case when coalesce((p_items->'meta'->>'partial')::boolean,false)
      or exists(select 1 from public.campaign_post_metrics where snapshot_id=s.id and fetch_status='error') then 'partial' else 'succeeded' end,
    posts_found=(select count(*) from public.campaign_post_metrics where snapshot_id=s.id and fetch_status='found'),
    apify_cost_usd=(p_items->'meta'->>'cost')::numeric, followers_collected=collected, followers_snapshot_id=follower_id,
    error=p_items->'meta'->>'error' where id=s.id returning * into s;
  -- Recompute from the two latest valid observations; errors never break the sequence.
  for pid in select unnest(s.target_post_ids) loop
    select string_agg(fetch_status,',' order by taken_at desc,created_at desc) into previous_status from (
      select m.fetch_status,x.taken_at,x.created_at from public.campaign_post_metrics m join public.campaign_snapshots x on x.id=m.snapshot_id
      where m.post_id=pid and x.project_id=s.project_id and x.status in ('succeeded','partial') and m.fetch_status <> 'error'
      order by x.taken_at desc,x.created_at desc limit 2) observations;
    update public.campaign_posts set status=case when previous_status='not_found,not_found' then 'unverified'
      when split_part(previous_status,',',1)='found' then 'active' else status end,updated_at=now()
      where id=pid and project_id=s.project_id and status in ('active','unverified');
  end loop;
  update public.campaign_rules set first_posted_at=(select min(posted_at) from public.campaign_posts where project_id=s.project_id)
    where project_id=s.project_id and first_posted_at is null;
  return s;
end $$;
revoke execute on function public.campaign_reserve_snapshot(uuid,numeric,uuid,uuid[],text,boolean,boolean,numeric,numeric) from public,anon,authenticated;
revoke execute on function public.campaign_finalize_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_reserve_snapshot(uuid,numeric,uuid,uuid[],text,boolean,boolean,numeric,numeric) to service_role;
grant execute on function public.campaign_finalize_snapshot(uuid,jsonb,jsonb) to service_role;
commit;

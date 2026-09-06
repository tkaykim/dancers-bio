create table if not exists public.rate_checks (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null,
  campaign_kind text not null default 'music_challenge',
  followers integer,
  full_name text,
  profile_pic_url text,
  is_private boolean not null default false,
  reels jsonb not null default '[]'::jsonb,
  reels_used smallint not null default 0,
  sample_status text not null,
  trimmed_mean integer,
  median_views integer,
  views_low integer,
  views_high integer,
  expected_views integer,
  tier text,
  f_base integer,
  v_base integer,
  formula_rate integer,
  out_of_ladder boolean not null default false,
  raw jsonb,
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rate_checks_handle_created_idx on public.rate_checks (ig_handle, created_at desc);
alter table public.rate_checks enable row level security;
revoke all on public.rate_checks from anon, authenticated;
-- No policies: requireAdmin + service-role only.
comment on table public.rate_checks is '관리자 페이 산정 도구 조회 기록. 금액은 안내가(산식)이며 계약가가 아니다.';

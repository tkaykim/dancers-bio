-- deetz Workshops: 수요 기반 해외 안무가 초청 워크샵 (크라우드펀딩형)
-- 흐름: 누구나 안무가 제안(이름·인스타 필수) → 카드 공개(published) 후 무료 수요 표시(vote)
--       → 운영진이 모집 오픈(recruiting: 예약금·총액·최소/최대 인원 확정) → 예약금 결제 waitlist
--       → 최소 인원 달성 시 초청 확정(confirmed). 미달 취소 시 전액 환불(수동, refunded 기록).
-- 접근 방식: 세 테이블 모두 RLS default-deny(service-role 전용) — village_waitlist와 동일 posture.
--            공개 노출은 서버 컴포넌트가 admin client로 읽어 렌더한다.

-- 1) 후보 안무가 카드
create table if not exists public.workshop_artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  instagram_handle text not null,
  image_url text,
  country text,
  genres text[] not null default '{}',
  headline text,
  description text,
  -- suggested: 유저 제안 상태(비공개) / published: 카드 공개(수요 수집)
  -- recruiting: 모집 오픈(예약금 결제) / confirmed: 초청 확정 / completed: 진행 완료 / archived: 내림
  status text not null default 'suggested'
    check (status in ('suggested','published','recruiting','confirmed','completed','archived')),
  -- 모집 오픈 시 확정되는 값들 (status='recruiting' 이후 유효)
  deposit_amount integer check (deposit_amount is null or deposit_amount > 0),
  total_price integer check (total_price is null or total_price > 0),
  min_headcount integer check (min_headcount is null or min_headcount > 0),
  max_headcount integer check (max_headcount is null or max_headcount > 0),
  expected_period text,
  recruit_deadline timestamptz,
  recruit_opened_at timestamptz,
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 인스타 핸들로 중복 제안을 같은 카드로 합친다 (소문자 정규화는 앱에서, 방어는 여기서)
create unique index if not exists workshop_artists_instagram_uniq
  on public.workshop_artists (lower(instagram_handle));
create index if not exists workshop_artists_status_idx on public.workshop_artists (status);

alter table public.workshop_artists enable row level security;
revoke all on table public.workshop_artists from anon, authenticated;

comment on table public.workshop_artists is
  'deetz 워크샵 후보 안무가 카드. status=suggested(비공개 제안)→published(수요 수집)→recruiting(예약금 모집)→confirmed→completed. RLS default-deny(service-role 전용).';

-- 2) 수요 표시 (제안 nominate / 찜 vote 통합)
create table if not exists public.workshop_demands (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.workshop_artists(id) on delete cascade,
  source text not null default 'vote' check (source in ('nominate','vote')),
  contact_email text,
  contact_instagram text,
  user_id uuid references public.profiles(id) on delete set null,
  want_type text check (want_type is null or want_type in ('class','workshop','camp')),
  comment text,
  created_at timestamptz not null default now()
);

-- 같은 사람(이메일/인스타/계정)이 같은 안무가에 중복 수요를 못 넣게 부분 unique
create unique index if not exists workshop_demands_email_uniq
  on public.workshop_demands (artist_id, lower(contact_email)) where contact_email is not null;
create unique index if not exists workshop_demands_instagram_uniq
  on public.workshop_demands (artist_id, lower(contact_instagram)) where contact_instagram is not null;
create unique index if not exists workshop_demands_user_uniq
  on public.workshop_demands (artist_id, user_id) where user_id is not null;
create index if not exists workshop_demands_artist_idx on public.workshop_demands (artist_id);

alter table public.workshop_demands enable row level security;
revoke all on table public.workshop_demands from anon, authenticated;

comment on table public.workshop_demands is
  'deetz 워크샵 수요 표시. nominate=신규 제안, vote=공개 카드 찜. 비로그인 허용(이메일 또는 인스타 핸들로 dedup). RLS default-deny(service-role 전용).';

-- 3) 예약금 예약 (모집 오픈된 워크샵에만, deetz 계정 필수)
create table if not exists public.workshop_reservations (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.workshop_artists(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  amount integer not null check (amount > 0),
  currency text not null default 'KRW',
  -- pending: 주문 생성(미결제) / paid: 예약금 결제 완료 / cancelled: 결제 전 취소·만료
  -- refunded: 환불 완료(미달 취소 등, 수동 환불 후 기록) / transferred: 확정 후 양도
  -- confirmed: 워크샵 확정 후 참가 확정
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled','refunded','transferred','confirmed')),
  pg_provider text check (pg_provider is null or pg_provider in ('toss','paypal')),
  order_no text not null unique,
  pg_order_id text unique,
  payment_key text,
  receipt_url text,
  paid_at timestamptz,
  failure_reason text,
  refunded_at timestamptz,
  memo text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 한 유저가 한 워크샵에 활성 예약 1건만 (pending은 재시도 시 재사용)
create unique index if not exists workshop_reservations_active_uniq
  on public.workshop_reservations (artist_id, user_id)
  where status in ('pending','paid','confirmed');
create index if not exists workshop_reservations_artist_idx on public.workshop_reservations (artist_id, status);

alter table public.workshop_reservations enable row level security;
revoke all on table public.workshop_reservations from anon, authenticated;

comment on table public.workshop_reservations is
  'deetz 워크샵 예약금 결제 레코드(Toss/PayPal). 예약금=수강료 일부 선납. 미달 취소=전액 환불(수동 처리 후 refunded 기록), 확정 후=환불 불가(양도만 transferred). RLS default-deny(service-role 전용).';

-- 4) 카드 이미지 버킷
insert into storage.buckets (id, name, public)
values ('workshop-artists', 'workshop-artists', true)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif']
where id = 'workshop-artists';

-- 업로드는 관리자만 (브라우저 직접 업로드), 열람은 public 버킷이라 자유
drop policy if exists workshop_artists_storage_insert on storage.objects;
create policy workshop_artists_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workshop-artists' and public.is_admin());

drop policy if exists workshop_artists_storage_update on storage.objects;
create policy workshop_artists_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'workshop-artists' and public.is_admin());

drop policy if exists workshop_artists_storage_delete on storage.objects;
create policy workshop_artists_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'workshop-artists' and public.is_admin());

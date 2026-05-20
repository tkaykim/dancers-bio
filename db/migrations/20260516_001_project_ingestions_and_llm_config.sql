-- 외부 채널 (인스타/카페/디시/카톡 등) 에서 admin 이 수집한 공고 텍스트를
-- LLM 으로 구조화한 후 검토를 거쳐 projects 에 등록하기 위한 ingestion 큐.
--
-- 흐름:
--   draft  -- LLM 파싱 성공 후, admin 검토 대기
--   published  -- 신규 project 발행
--   merged     -- 기존 project 와 동일 판정 (merged_into_project_id)
--   dismissed  -- admin 이 무시

create extension if not exists pg_trgm;

create table if not exists public.project_ingestions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  source_url text,
  source_raw text not null,
  parsed_json jsonb,
  parse_error text,
  llm_provider text check (llm_provider in ('anthropic','gemini')),
  llm_model text,
  status text not null default 'draft'
    check (status in ('draft','published','dismissed','merged')),
  merged_into_project_id uuid references public.projects(id) on delete set null,
  published_project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists project_ingestions_status_idx
  on public.project_ingestions (status, created_at desc);

create index if not exists project_ingestions_created_by_idx
  on public.project_ingestions (created_by);

alter table public.project_ingestions enable row level security;

drop policy if exists ingestions_admin_all on public.project_ingestions;
create policy ingestions_admin_all on public.project_ingestions
  for all using (public.is_admin()) with check (public.is_admin());

-- projects 에 source 메타 추가
alter table public.projects add column if not exists source_url text;
alter table public.projects
  add column if not exists ingestion_id uuid references public.project_ingestions(id);

create index if not exists projects_source_url_idx
  on public.projects (source_url) where source_url is not null and deleted_at is null;

-- 제목 trigram 인덱스 (중복 후보 검색용)
create index if not exists projects_title_trgm_idx
  on public.projects using gin (title gin_trgm_ops)
  where deleted_at is null;

-- 싱글톤 app_config 테이블 (LLM provider 기본값 등)
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  default_llm_provider text not null default 'gemini'
    check (default_llm_provider in ('anthropic','gemini')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_config (id) values (true)
  on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists app_config_admin_all on public.app_config;
create policy app_config_admin_all on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());

-- 공개 read 도 허용 (default provider 같은 건 admin UI 외부에서 안 쓰지만, 향후 확장 여지)
drop policy if exists app_config_public_read on public.app_config;
create policy app_config_public_read on public.app_config
  for select using (true);

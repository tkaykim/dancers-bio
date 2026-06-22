-- deetz 카카오 알림톡 멱등/이력 로그. service-role(앱 admin client)만 접근.
-- 적용: 2026-06-22 (Supabase MCP apply_migration). 코드: src/lib/alimtalk/*.

create table if not exists public.alimtalk_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,            -- dancer_approved | profile_incomplete | casting_proposal | schedule_request
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  ref_id text,                         -- application_id / project_id / null (이벤트별 멱등 기준)
  phone text,
  template_id text,
  status text not null default 'claimed', -- claimed | sent | failed | skipped
  message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- 멱등: (이벤트, 댄서, 참조) 1회. ref_id NULL은 빈문자열로 정규화해 유니크 처리.
create unique index if not exists alimtalk_log_dedupe
  on public.alimtalk_log (event_type, dancer_id, coalesce(ref_id, ''));

create index if not exists alimtalk_log_dancer_idx
  on public.alimtalk_log (dancer_id, created_at desc);

-- RLS enable + 정책 없음 = anon/authenticated default deny. service-role은 RLS 우회.
alter table public.alimtalk_log enable row level security;

-- 캠페인(일괄 발송) — 방이 아니라 발송 도구.
-- 원문 1건(broadcast_campaigns) + 수신자별 전달 기록(broadcast_deliveries)로 분리한다.
-- 예약 시점에 전 수신자 delivery 를 확정한다(스냅샷 불변 — 취소·감사 대상이 변하지 않게).
-- 발송 흐름: scheduled → (30초 취소 창) → sending → 크론이 pending delivery 를 청크 처리 → 전부 terminal 이면 sent.

create type public.broadcast_campaign_status as enum ('scheduled', 'sending', 'sent', 'cancelled');
create type public.broadcast_delivery_status as enum ('pending', 'sent', 'failed', 'skipped_no_account');

create table public.broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  body text not null,
  -- 응답 요청 카드 정의(선택). chat_messages.action 과 같은 스키마.
  action jsonb,
  -- 대상 스냅샷: {"segment":"round1","computed_at":"...","included":23,"excluded":[{dancer_id,reason}...]}
  audience jsonb not null default '{}'::jsonb,
  -- 발송 채널 옵션: {"mail":true}
  channels jsonb not null default '{}'::jsonb,
  status public.broadcast_campaign_status not null default 'scheduled',
  -- 취소 창: 생성 +30초. 크론이 이 시각 이후에만 발송을 시작한다.
  send_after timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  constraint broadcast_campaigns_body_len check (char_length(body) <= 4000)
);
create index idx_broadcast_campaigns_project on public.broadcast_campaigns (project_id);

create table public.broadcast_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.broadcast_campaigns(id) on delete cascade,
  room_id uuid references public.chat_rooms(id) on delete set null,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  status public.broadcast_delivery_status not null default 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_broadcast_deliveries unique (campaign_id, dancer_id)
);
create index idx_broadcast_deliveries_pending
  on public.broadcast_deliveries (campaign_id)
  where status = 'pending';

alter table public.broadcast_campaigns enable row level security;
alter table public.broadcast_deliveries enable row level security;

-- 열람 = 프로젝트 운영자만. 쓰기 정책 없음(service-role 전용).
create policy broadcast_campaigns_select on public.broadcast_campaigns
  for select to authenticated
  using (public.is_admin() or public.can_manage_project(project_id));

create policy broadcast_deliveries_select on public.broadcast_deliveries
  for select to authenticated
  using (
    exists (
      select 1 from public.broadcast_campaigns c
       where c.id = campaign_id
         and (public.is_admin() or public.can_manage_project(c.project_id))
    )
  );

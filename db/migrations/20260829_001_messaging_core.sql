-- 메시지 센터 코어: 방·멤버·메시지·내부 메모·구조화 응답·전송 rate 버킷.
-- 설계 정본: deetz 메시지 센터 v2.1 + 구현계획 v1.0 (2026-08-28 교차검증).
--
-- 원칙
--  · 쓰기 정책은 만들지 않는다 — 모든 쓰기는 서버 액션(service-role)만.
--    (casting_board_comments·notifications 와 같은 패턴)
--  · SELECT 정책은 SECURITY DEFINER 헬퍼로 판정한다(재귀·성능 — Supabase 공식 권고).
--  · 내부 메모는 chat_messages 가 아니라 별도 테이블 — RLS 조건 하나의 실수로
--    운영 메모가 지원자에게 노출되는 사고를 구조적으로 차단하고,
--    room_seq·last_message_at(정렬·미읽음)을 오염시키지 않는다.

create type public.chat_room_kind as enum ('direct', 'group');
create type public.chat_sender_role as enum ('team', 'member', 'system');
create type public.chat_message_kind as enum ('text', 'notice', 'action_request', 'system');

-- ── 방 ──────────────────────────────────────────────────────────────
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.chat_room_kind not null default 'direct',
  -- 직접방의 상대 = 프로젝트×댄서. 지원서(application) 단위가 아니다 —
  -- 같은 (프로젝트, 댄서)에 지원서가 여러 장인 사례가 116건 실존(재지원·직접제안).
  direct_dancer_id uuid references public.dancers(id) on delete cascade,
  team_id uuid, -- 예약: 팀 지원 스레드(현재 팀 지원 0건, v1 미사용)
  title text,
  settings jsonb not null default '{}'::jsonb,
  -- 방별 단조 증가 시퀀스. 읽음·증분 조회의 기준(타임스탬프 비교 금지).
  last_seq bigint not null default 0,
  -- "운영팀 읽음"(댄서에게 표시) = 팀 단위 워터마크. 스태프 개인별 읽음은 두지 않는다(공동 인박스).
  staff_last_read_seq bigint not null default 0,
  -- 미답변 정의: 지원자(member) 발신 시 설정, 스태프 외부 발신 또는 명시적 처리 완료로만 해제.
  awaiting_staff_since timestamptz,
  -- 처리 완료 표시. 지원자가 답장하면 자동 해제(재오픈) — 업계 만장일치 관례.
  resolved_at timestamptz,
  -- 예외적 발신 차단(admin 전용). resolve 와 다르게 지원자 발신을 막는다.
  closed_at timestamptz,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_rooms_direct_needs_dancer check (kind <> 'direct' or direct_dancer_id is not null)
);

-- 보관 여부와 무관하게 유일 — 재개 시 기존 방을 재활성화한다(파편화 방지).
create unique index uq_chat_rooms_direct
  on public.chat_rooms (project_id, direct_dancer_id)
  where kind = 'direct';
create index idx_chat_rooms_project on public.chat_rooms (project_id);
create index idx_chat_rooms_awaiting on public.chat_rooms (awaiting_staff_since)
  where awaiting_staff_since is not null;

-- ── 멤버(댄서 좌석만) ────────────────────────────────────────────────
-- 스태프는 행을 만들지 않는다 — can_manage_project() 로 판정하므로
-- 공동관리자 추가·삭제 시 멤버십 동기화가 필요 없다.
create table public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  last_read_seq bigint not null default 0,
  muted_until timestamptz,
  removed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, dancer_id)
);
create index idx_chat_room_members_dancer on public.chat_room_members (dancer_id);

-- ── 메시지 ──────────────────────────────────────────────────────────
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  room_seq bigint not null,
  -- 전송 멱등키(더블클릭·재시도 중복 차단). 클라이언트가 생성한다.
  client_message_id text,
  sender_user_id uuid references public.profiles(id) on delete set null,
  sender_role public.chat_sender_role not null,
  kind public.chat_message_kind not null default 'text',
  body text not null default '',
  -- 발신 시점의 지원서(맥락 고정). 방은 사람 단위로 지속되므로 참조만 남긴다.
  application_id uuid references public.applications(id) on delete set null,
  -- action_request 정의: {"choices":["가능","불가","일부만 가능"],"deadline":"...","detail_required_for":["일부만 가능"]}
  action jsonb,
  -- 소프트 삭제(tombstone). 본문은 DB에 보존한다 — 기록 자산 원칙.
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  created_at timestamptz not null default now(),
  constraint uq_chat_messages_room_seq unique (room_id, room_seq),
  constraint chat_messages_body_len check (char_length(body) <= 4000)
);
-- (room_id, room_seq) 유니크가 조회 인덱스를 겸한다 — 중복 DESC 인덱스는 만들지 않는다.
create unique index uq_chat_messages_client
  on public.chat_messages (room_id, client_message_id)
  where client_message_id is not null;

-- room_seq 원자 채번 + 방 상태 갱신.
-- trg_ 접두사 필수 — 행 트리거는 이름 알파벳순으로 실행된다(기실측 함정).
create or replace function public.trg_chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  update public.chat_rooms
     set last_seq = last_seq + 1,
         last_message_at = now(),
         updated_at = now(),
         awaiting_staff_since = case
           when new.sender_role = 'member' then coalesce(awaiting_staff_since, now())
           when new.sender_role = 'team' then null
           else awaiting_staff_since
         end,
         resolved_at = case
           when new.sender_role = 'member' then null  -- 처리 완료 후 답장 = 자동 재오픈
           else resolved_at
         end
   where id = new.room_id
   returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'chat room % not found', new.room_id;
  end if;

  new.room_seq := v_seq;
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_chat_messages_seq
  before insert on public.chat_messages
  for each row execute function public.trg_chat_messages_before_insert();

-- ── 내부 메모(스태프 전용, 별도 테이블) ──────────────────────────────
create table public.chat_internal_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_internal_notes_body_len check (char_length(body) <= 4000)
);
create index idx_chat_internal_notes_room on public.chat_internal_notes (room_id);

-- ── 구조화 응답(응답 요청 카드) ──────────────────────────────────────
-- jsonb 누적 금지(lost update) — 1인 1행 upsert.
create table public.chat_message_responses (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  choice text not null,
  detail text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, dancer_id),
  constraint chat_message_responses_choice_len check (char_length(choice) <= 80),
  constraint chat_message_responses_detail_len check (char_length(detail) <= 1000)
);

-- ── 전송 rate 버킷(원자적) ──────────────────────────────────────────
-- COUNT-후-INSERT 는 동시 요청에 뚫린다 — upsert 증가 RETURNING 으로 원자화.
-- bucket_key 예: 'user:<uid>:<epoch-min>' / 'room:<room>:<epoch-min>'
create table public.message_rate_buckets (
  bucket_key text primary key,
  count integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_internal_notes enable row level security;
alter table public.chat_message_responses enable row level security;
alter table public.message_rate_buckets enable row level security; -- 정책 없음 = service-role 전용

-- 스태프 판정(운영팀 좌석) — is_admin OR can_manage_project.
create or replace function public.can_staff_chat_room(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.chat_rooms r
     where r.id = p_room
       and (public.is_admin() or public.can_manage_project(r.project_id))
  );
$$;

-- 열람 판정 — 스태프 OR 직접방의 당사자 댄서(매니저 포함, can_act_as_dancer).
create or replace function public.can_view_chat_room(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.chat_rooms r
     where r.id = p_room
       and (
         public.is_admin()
         or public.can_manage_project(r.project_id)
         or (r.kind = 'direct'
             and r.direct_dancer_id is not null
             and public.can_act_as_dancer(r.direct_dancer_id))
       )
  );
$$;

create policy chat_rooms_select on public.chat_rooms
  for select to authenticated
  using (
    public.is_admin()
    or public.can_manage_project(project_id)
    or (kind = 'direct'
        and direct_dancer_id is not null
        and public.can_act_as_dancer(direct_dancer_id))
  );

create policy chat_room_members_select on public.chat_room_members
  for select to authenticated
  using (public.can_act_as_dancer(dancer_id) or public.can_staff_chat_room(room_id));

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (public.can_view_chat_room(room_id));

create policy chat_internal_notes_select on public.chat_internal_notes
  for select to authenticated
  using (public.can_staff_chat_room(room_id));

create policy chat_message_responses_select on public.chat_message_responses
  for select to authenticated
  using (
    public.can_act_as_dancer(dancer_id)
    or exists (
      select 1 from public.chat_messages m
       where m.id = message_id and public.can_staff_chat_room(m.room_id)
    )
  );

-- deetz Village(디츠 빌리지) 사전 수요조사 waitlist.
-- 한국 보증금(1천만~2천만원) 장벽 때문에 정착하지 못하는 외국 댄서를 위한 도미토리형 숙소 예고 페이지(/village)의 접수 테이블.
-- 아직 오픈 전이라 결제는 받지 않는다 — 수요조사(관심 등록) + 진행하지 않는 사유 수집만 한다.
--
-- interested=true  → 이름·국적·연락처 필수, 희망 옵션/입주 시기 수집
-- interested=false → 진행하지 않는 사유(복수 선택) + 상세, 개인정보는 전부 선택

create table if not exists public.village_waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- 진행 희망 여부. false = "지금은 진행 안 함"(사유 설문)
  interested boolean not null,

  name text,
  nationality_code text,
  nationality text,
  contact_type text,
  contact text,

  -- 희망 옵션: a=강서구 2층(첫달 200/월 50), b=강서구 4층 엘리베이터(첫달 240/월 60)
  preferred_option text check (preferred_option in ('a', 'b', 'either', 'undecided')),
  -- 희망 입주 시기 'YYYY-MM'
  move_in_month text,
  -- 희망 방 형태: single | double | quad | six | any
  room_preference text check (room_preference in ('single', 'double', 'quad', 'six', 'any')),
  message text,

  -- 진행 안 함 사유(복수): price | roommate | already_housed | facility | location | timing | other
  decline_reasons text[] not null default '{}',
  decline_reason_detail text,

  lang text not null default 'en',
  source text not null default 'village',

  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  memo text
);

create index if not exists village_waitlist_created_at_idx
  on public.village_waitlist (created_at desc);

create index if not exists village_waitlist_interested_idx
  on public.village_waitlist (interested, created_at desc);

-- service-role 전용. 공개 폼 제출도 서버 액션(admin client)을 통해서만 들어온다.
alter table public.village_waitlist enable row level security;

comment on table public.village_waitlist is
  'deetz Village 사전 수요조사 접수. interested=true는 대기자 등록, false는 미진행 사유 설문. RLS default-deny(service-role 전용).';

-- deetz E-6-1 비자 온보딩 신청. 해외(비자 없는) 댄서가 공개 폼(/visa/apply)으로 제출.
-- 제출 시 dancers 비공개 row(approval_status=pending → 디렉토리 제외, is_active=true → 링크만 동작)
-- + dancer_private_info(국적/비자/연락처) 와 함께 이 테이블에 비자신청 전용 정보를 적재한다.
-- 접근은 전부 service-role(서버 액션 submitVisaApplicationAction / 어드민) 경유 — anon RLS 정책 없음(default deny).

create table if not exists public.dancer_visa_applications (
  id uuid primary key default gen_random_uuid(),
  -- 함께 생성된 비공개 dancers row. 행 삭제 시에도 신청 이력은 보존(set null).
  dancer_id uuid references public.dancers(id) on delete set null,
  -- 자기진단 실력 단계: 1=트레이닝 필요, 2=어느정도, 3=현장 투입 준비, 4=안무·무대 경험
  skill_level smallint check (skill_level between 1 and 4),
  dance_video_url text,
  -- 체류
  currently_in_korea boolean,
  has_residence_in_korea boolean,
  residence_region text,
  available_entry_date date,
  -- 연락 (이메일 필수 + 메신저 다중 [{ "type": "Instagram", "handle": "@x" }, ...])
  email text not null,
  contacts jsonb not null default '[]'::jsonb,
  preferred_lang text,                  -- en | ja | ko (제출 시 사용 언어)
  -- 운영 워크플로
  status text not null default 'new',   -- new|reviewing|education|documents|submitted|approved|on_hold|rejected
  assigned_to uuid references auth.users(id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visa_apps_status on public.dancer_visa_applications(status);
create index if not exists idx_visa_apps_created on public.dancer_visa_applications(created_at desc);
create index if not exists idx_visa_apps_dancer on public.dancer_visa_applications(dancer_id);

alter table public.dancer_visa_applications enable row level security;
-- 정책 없음 = default deny. 전 접근 service-role(서버 액션·어드민) 경유.

comment on table public.dancer_visa_applications is
  'deetz E-6-1 비자 온보딩 신청(해외 댄서). 접근은 service-role 전용(RLS 정책 없음). dancer_id=함께 생성된 비공개 dancers row.';

-- updated_at 자동 갱신
create or replace function public.set_updated_at_visa_apps()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_visa_apps_updated_at on public.dancer_visa_applications;
create trigger trg_visa_apps_updated_at
  before update on public.dancer_visa_applications
  for each row execute function public.set_updated_at_visa_apps();

-- 사이트 진입 공지 팝업 (미수·정산 제보 안내 등). 관리자가 /admin/popup 에서 관리.
-- 공개(anon/authenticated)는 활성 팝업만 SELECT 가능, 쓰기는 service-role(관리자 액션)만.
create table if not exists site_popups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  cta_label text,
  cta_href text,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_popups enable row level security;

drop policy if exists site_popups_public_read on site_popups;
create policy site_popups_public_read on site_popups
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );
-- INSERT/UPDATE/DELETE 정책 없음 = service-role 전용 (관리자 서버액션 경유).

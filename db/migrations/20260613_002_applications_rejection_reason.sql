-- 지원 거절 사유(선택). 거절 시에만 채워지고 수락/대기 복귀 시 비운다.
alter table public.applications add column if not exists rejection_reason text;

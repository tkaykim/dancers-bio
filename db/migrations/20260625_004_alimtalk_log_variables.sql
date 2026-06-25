-- 알림톡 발송 로그에 치환변수(내용) 저장 — admin 발송내역에서 실제 보낸 값 확인용.
alter table public.alimtalk_log add column if not exists variables jsonb;

-- 신발 사이즈(mm). 선택 입력 — 기입 시 캐스팅 매칭/섭외 정확도 향상용.
-- (키 height_cm 는 기존 컬럼) 둘 다 민감정보: RLS 본인+관리자만, 프론트 노출은 매니저 게이트 경유.
alter table public.dancer_private_info add column if not exists shoe_size_mm integer;

-- 하의 사이즈를 허리(인치) + 기장(cm)으로 분리 수집. 상의는 top_size에 "95(M)" 형태 저장.
-- 기존 bottom_size(20260701_001)는 미사용(잔존, 데이터 없음).
alter table dancer_private_info
  add column if not exists pants_waist_inch text,
  add column if not exists pants_length_cm text;

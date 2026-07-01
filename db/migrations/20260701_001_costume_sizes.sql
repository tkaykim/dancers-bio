-- 의상 상·하의 사이즈 수집 컬럼 (남자아이돌 MV 등 프로젝트 의상 준비용).
-- 비민감 정보. RLS는 기존 dancer_private_info 정책 그대로(본인 + 관리자).
alter table dancer_private_info
  add column if not exists top_size text,
  add column if not exists bottom_size text;

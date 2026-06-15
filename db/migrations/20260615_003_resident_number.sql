-- 정산용 주민등록번호(외국인등록번호). 원천세 신고·정산서 대비.
-- dancer_private_info(본인+슈퍼관리자 RLS)에 보관. UI는 마스킹 + 눈 아이콘으로 전체보기.
-- ⚠️ 향후 자동이체 도입 시 at-rest 암호화로 전환 권장(현재는 계좌와 동일 보호수준).
alter table public.dancer_private_info
  add column if not exists resident_registration_number text;

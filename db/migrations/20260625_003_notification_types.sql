-- 알림 타입 추가: 공지 등록 / 정산완료(금액확정) / 입금완료.
-- (settlement_withdrawal_requested 는 기존에 존재 — 관리자 출금신청 접수 알림)
alter type public.notification_type add value if not exists 'announcement_posted';
alter type public.notification_type add value if not exists 'settlement_confirmed';
alter type public.notification_type add value if not exists 'settlement_paid';
-- 정산정보(계좌·주민번호) 미기입자에게 입력 요청 알림
alter type public.notification_type add value if not exists 'settlement_info_required';

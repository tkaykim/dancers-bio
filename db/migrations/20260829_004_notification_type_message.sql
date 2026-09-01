-- 인앱 알림 타입에 메시지 수신 추가.
-- ALTER TYPE ... ADD VALUE 는 같은 트랜잭션 안에서 새 값을 사용할 수 없어 단독 파일로 분리한다(20260625 전례).

alter type public.notification_type add value if not exists 'message_received';

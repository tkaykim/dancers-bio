-- 공고 매칭 알림용 notification_type 값. (007 의 RPC/로그보다 먼저 적용 — enum ADD VALUE 는
-- 같은 트랜잭션에서 사용 불가하므로 별도 마이그레이션으로 분리)
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'project_posted_match';

-- 회원 신청 연결은 서버의 service-role 경로에서만 처리한다.
-- 공개 API 스키마의 SECURITY DEFINER RPC는 필요하지 않으므로 제거한다.

drop function if exists public.claim_my_visa_applications();

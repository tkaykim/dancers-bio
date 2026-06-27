-- count_all_dancers(): 전체 등록 댄서 프로필 수 (RLS-safe, SECURITY DEFINER).
-- 공개 프로필 하단 "N명의 댄서들이 deetz에서 활동 중" 사회적 증거에 사용.
-- anon 은 public.dancers 를 직접 SELECT 할 수 없으므로(RLS) DEFINER 함수로 카운트만 노출한다.

create or replace function public.count_all_dancers()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*) from public.dancers;
$function$;

revoke all on function public.count_all_dancers() from public;
grant execute on function public.count_all_dancers() to anon, authenticated, service_role;

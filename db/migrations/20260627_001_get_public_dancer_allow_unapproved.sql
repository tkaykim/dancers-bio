-- 직접 URL(단건 slug/id) 조회는 승인 여부와 무관하게 허용 (project URL 모델).
-- 배경: anon 의 dancers 테이블 직접 SELECT 차단 + list_directory_dancers 40캡 은
--       "명단 통째 덤프(스크래핑/SEO)" 를 막기 위한 것일 뿐이다.
--       URL(slug/id)을 아는 사람은 미승인 프로필이어도 직접 들어가 볼 수 있어야 한다.
-- 덤프 방어는 그대로 유지: 이 함수는 단건 키 정확매칭 + limit 1 이라 명단 열거 불가.
-- 미승인 프로필은 페이지 generateMetadata 가 noindex 처리하므로 SEO 노출과는 분리된다.
-- is_active = false (명시적 비활성/숨김) 는 계속 제외한다.

create or replace function public.get_public_dancer(_key text)
returns setof dancers
language sql
stable
security definer
set search_path to 'public'
as $function$
  select *
  from public.dancers
  where is_active = true
    and (id::text = _key or slug = _key)
  limit 1;
$function$;

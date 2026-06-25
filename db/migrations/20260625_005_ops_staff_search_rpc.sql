-- 현장 스태프 등록용 계정 검색 RPC: 이름·이메일·인스타 + 전화번호(4자리 이상).
--   전화는 profiles.phone 또는 본인 dancer_private_info.phone 에서 digits-only 비교.
--   SECURITY DEFINER (auth.users·dancer_private_info 접근). 호출측 canManageProject 게이트.
-- 적용: 2026-06-25 (Supabase MCP apply_migration 로 선반영 후 파일 기록).

create or replace function public.admin_search_ops_staff_candidates(p_term text)
returns table(
  id uuid, display_name text, avatar_url text,
  instagram_handle text, email text, phone text
)
language sql security definer set search_path to 'public','auth'
as $function$
  select p.id, p.display_name, p.avatar_url, p.instagram_handle,
         u.email::text,
         coalesce(nullif(p.phone, ''), dpi.phone) as phone
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join lateral (
    select di.phone
    from public.dancers d
    join public.dancer_private_info di on di.dancer_id = d.id
    where d.profile_id = p.id and coalesce(di.phone, '') <> ''
    limit 1
  ) dpi on true
  where length(btrim(coalesce(p_term, ''))) >= 1
    and (
      p.display_name ilike '%' || btrim(p_term) || '%'
      or p.instagram_handle ilike '%' || btrim(p_term) || '%'
      or u.email ilike '%' || btrim(p_term) || '%'
      or (
        length(regexp_replace(p_term, '\D', '', 'g')) >= 4
        and (
          regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')
            like '%' || regexp_replace(p_term, '\D', '', 'g') || '%'
          or regexp_replace(coalesce(dpi.phone, ''), '\D', '', 'g')
            like '%' || regexp_replace(p_term, '\D', '', 'g') || '%'
        )
      )
    )
  order by p.display_name
  limit 8;
$function$;

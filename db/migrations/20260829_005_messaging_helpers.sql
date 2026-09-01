-- 메시징 서버 헬퍼 2종. 둘 다 service-role 전용(EXECUTE 회수).
--
-- bump_rate_bucket: 원자적 rate limit 카운터(COUNT-후-INSERT는 동시 요청에 뚫린다).
-- claim_message_jobs: FOR UPDATE SKIP LOCKED 잡 선점 — supabase-js로 표현 불가라 함수로 제공.

create or replace function public.bump_rate_bucket(p_key text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.message_rate_buckets (bucket_key, count)
  values (p_key, 1)
  on conflict (bucket_key)
  do update set count = public.message_rate_buckets.count + 1
  returning count;
$$;

revoke execute on function public.bump_rate_bucket(text) from public, anon, authenticated;
grant execute on function public.bump_rate_bucket(text) to service_role;

create or replace function public.claim_message_jobs(p_limit integer, p_lease_seconds integer default 120)
returns setof public.message_jobs
language sql
security definer
set search_path = ''
as $$
  with next as (
    select id
      from public.message_jobs
     where status = 'pending'
       and available_at <= now()
     order by available_at
     limit p_limit
       for update skip locked
  )
  update public.message_jobs j
     set status = 'processing',
         attempt_count = j.attempt_count + 1,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
    from next
   where j.id = next.id
  returning j.*;
$$;

revoke execute on function public.claim_message_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_message_jobs(integer, integer) to service_role;

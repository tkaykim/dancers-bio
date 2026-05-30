-- 댄서 경력 "프로 근접도" 내부 점수 저장 + 디렉토리 정렬 RPC.
--
-- 점수는 프론트엔드/네트워크에 절대 노출되지 않아야 한다:
--  - 점수는 본 테이블(dancers/careers)이 아니라 별도 테이블에 저장 → 기존 select("*") 안전.
--  - 별도 테이블은 RLS로 admin/service_role만 접근.
--  - 디렉토리 정렬은 SECURITY DEFINER RPC가 내부에서 ORDER BY하고 공개 컬럼만 반환.

-- ── 점수 저장 테이블 ────────────────────────────────────────────
create table if not exists public.career_scores (
  career_id   bigint primary key references public.careers(id) on delete cascade,
  score       numeric not null default 0,
  breakdown   jsonb,
  computed_at timestamptz not null default now()
);

create table if not exists public.dancer_scores (
  dancer_id    uuid primary key references public.dancers(id) on delete cascade,
  score        numeric not null default 0,
  career_count integer not null default 0,
  breakdown    jsonb,
  computed_at  timestamptz not null default now()
);

create index if not exists dancer_scores_score_idx on public.dancer_scores (score desc);

-- ── RLS: admin만 읽기. 쓰기는 service_role(RLS 우회)만. ──────────
alter table public.career_scores enable row level security;
alter table public.dancer_scores enable row level security;

drop policy if exists career_scores_admin_read on public.career_scores;
create policy career_scores_admin_read on public.career_scores
  for select using (public.is_admin());

drop policy if exists dancer_scores_admin_read on public.dancer_scores;
create policy dancer_scores_admin_read on public.dancer_scores
  for select using (public.is_admin());

-- ── 디렉토리 정렬 RPC ──────────────────────────────────────────
-- 점수 내림차순으로 승인·활성 댄서를 페이지네이션. 점수는 반환하지 않는다.
create or replace function public.list_directory_dancers(_limit integer, _offset integer)
returns table (
  id uuid,
  stage_name text,
  korean_name text,
  slug text,
  profile_img text,
  location text,
  genres text[],
  specialties text[],
  profile_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.stage_name, d.korean_name, d.slug, d.profile_img, d.location,
         d.genres, d.specialties, d.profile_id
  from public.dancers d
  left join public.dancer_scores s on s.dancer_id = d.id
  where d.approval_status = 'approved' and d.is_active = true
  order by coalesce(s.score, 0) desc, d.created_at desc
  limit greatest(_limit, 0) offset greatest(_offset, 0);
$$;

grant execute on function public.list_directory_dancers(integer, integer) to anon, authenticated;

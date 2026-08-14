-- 다주체 평가 + 공개/비공개 분리 (docs/QUALITY_PLAN.md)
--
-- 평가 주체 3종을 같은 테이블에 담는다 — 권한 설계를 새로 만들지 않기 위해서다.
--   director : 디렉터/프로젝트 담당자 (로그인 계정)      → 작품 관점 (실력·디렉션 수용·완성도·팀워크)
--   manager  : 현장 매니저 (event_staff / 운영자 계정)   → 운영 관점 (시간·소통·매너·지시이행·서류)
--   client   : 외부 클라이언트 (로그인 없음, 서명 토큰)   → 만족도 + 재섭외 의향 2문항
--
-- client 는 계정이 없으므로 evaluator_id 를 NULL 허용으로 바꾸고 토큰 해시로 식별한다.
-- client 쓰기는 기존 casting board 와 동일하게 "서명 토큰 검증 후 서버 액션(service-role)" 경로로만 일어난다.
-- (authenticated RLS 는 evaluator_id = auth.uid() 를 요구하므로 NULL 행은 자동으로 차단된다.)
--
-- 공개 정책: 원 점수·평가자·재섭외 의향은 내부 전용.
--   댄서 본인에게는 visible_to_dancer=true 인 행의 shared_note 만, 전용 RPC 로만 나간다.

-- ── ① 평가 테이블 확장 ──────────────────────────────────────────
alter table public.application_evaluations
  alter column evaluator_id drop not null;

alter table public.application_evaluations
  add column if not exists evaluator_role text not null default 'director',
  add column if not exists evaluator_label text,
  add column if not exists evaluator_token_hash text,
  add column if not exists axes jsonb,
  add column if not exists would_rebook boolean,
  add column if not exists visible_to_dancer boolean not null default false,
  add column if not exists shared_note text;

-- score(1~10) 는 기존 사전선별용이라 종료 평가에서는 비어 있을 수 있다.
alter table public.application_evaluations
  alter column score drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_evaluations_evaluator_role_check'
      and conrelid = 'public.application_evaluations'::regclass
  ) then
    alter table public.application_evaluations
      add constraint application_evaluations_evaluator_role_check
      check (evaluator_role = any (array['director', 'manager', 'client', 'admin']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'application_evaluations_stage_check'
      and conrelid = 'public.application_evaluations'::regclass
  ) then
    alter table public.application_evaluations
      add constraint application_evaluations_stage_check
      check (stage = any (array['prescreen', 'wrap']));
  end if;

  -- 평가자 신원은 계정(evaluator_id) 또는 토큰(evaluator_token_hash) 중 하나는 반드시 있어야 한다.
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_evaluations_identity_check'
      and conrelid = 'public.application_evaluations'::regclass
  ) then
    alter table public.application_evaluations
      add constraint application_evaluations_identity_check
      check (evaluator_id is not null or evaluator_token_hash is not null);
  end if;
end
$$;

-- 기존 유니크(application_id, evaluator_id, stage)는 NULL evaluator_id 를 못 막는다.
-- 계정 평가 / 토큰 평가를 각각의 부분 유니크 인덱스로 분리하고 role 을 키에 포함한다.
alter table public.application_evaluations
  drop constraint if exists application_evaluations_application_id_evaluator_id_stage_key;

create unique index if not exists application_evaluations_account_key
  on public.application_evaluations(application_id, evaluator_id, stage, evaluator_role)
  where evaluator_id is not null;

create unique index if not exists application_evaluations_token_key
  on public.application_evaluations(application_id, evaluator_token_hash, stage)
  where evaluator_token_hash is not null;

create index if not exists application_evaluations_stage_role_idx
  on public.application_evaluations(stage, evaluator_role);

comment on column public.application_evaluations.evaluator_role is
  'director | manager | client | admin — 주체별로 평가 가능한 축(axes)이 다르다.';
comment on column public.application_evaluations.axes is
  '역할별 세부 축 점수 {키: 1~5}. director: skill/direction/performance/teamwork, manager: punctuality/communication/manner/compliance/paperwork, client: satisfaction.';
comment on column public.application_evaluations.would_rebook is
  '재섭외 의향 — 축 평균보다 신뢰도 높은 단일 지표. 내부 전용, 댄서에게 절대 노출 금지.';
comment on column public.application_evaluations.visible_to_dancer is
  'true 인 행의 shared_note 만 댄서 본인에게 노출된다(get_my_dancer_feedback RPC). 원 점수·평가자는 어떤 경우에도 노출하지 않는다.';

-- ── ② 종합점수 캐시 (내부 전용) ────────────────────────────────
create table if not exists public.dancer_quality_scores (
  dancer_id uuid primary key references public.dancers(id) on delete cascade,
  dqs numeric not null default 0,
  profile_score numeric,
  career_score numeric,
  reliability_score numeric,
  eval_count integer not null default 0,
  rebook_rate numeric,
  percentile numeric,
  grade text,
  breakdown jsonb,
  computed_at timestamptz not null default now(),
  constraint dancer_quality_scores_grade_check
    check (grade is null or grade = any (array['S', 'A', 'B', 'C', 'D']))
);

create index if not exists dancer_quality_scores_dqs_idx
  on public.dancer_quality_scores(dqs desc);

-- dancer_scores 와 동일 정책: admin 만 읽기, 쓰기는 service_role(RLS 우회)만.
alter table public.dancer_quality_scores enable row level security;

drop policy if exists dancer_quality_scores_admin_read on public.dancer_quality_scores;
create policy dancer_quality_scores_admin_read on public.dancer_quality_scores
  for select using (public.is_admin());

revoke all on public.dancer_quality_scores from anon, authenticated;
grant select on public.dancer_quality_scores to authenticated;

comment on table public.dancer_quality_scores is
  '종합 퀄리티 점수(DQS) 캐시. 내부 전용 — 공개 RPC 는 이 테이블 값을 반환하지 않는다.';

-- ── ③ 댄서 본인용 피드백 RPC (컬럼 화이트리스트) ───────────────
-- RLS 로는 컬럼 단위 제한이 안 되므로, 본인 공개분은 SECURITY DEFINER RPC 로만 내보낸다.
-- 반환값에 점수·평가자·재섭외 의향은 포함하지 않는다.
create or replace function public.get_my_dancer_feedback(_dancer_id uuid)
returns table (
  project_title text,
  shared_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.title, e.shared_note, e.created_at
  from public.application_evaluations e
  join public.applications a on a.id = e.application_id
  join public.projects p on p.id = a.project_id
  join public.dancers d on d.id = a.dancer_id
  where d.id = _dancer_id
    and d.profile_id = auth.uid()          -- 본인 프로필만
    and e.visible_to_dancer = true
    and e.shared_note is not null
  order by e.created_at desc
  limit 50;
$$;

revoke all on function public.get_my_dancer_feedback(uuid) from anon;
grant execute on function public.get_my_dancer_feedback(uuid) to authenticated;

comment on function public.get_my_dancer_feedback(uuid) is
  '댄서 본인에게 공개 승인된 피드백만 반환. 점수·등급·평가자·재섭외 의향은 반환하지 않는다.';
